import { Disposable, getDebugLogger, isOSX, URI, FileUri, Deferred } from '@ali/ide-core-common';
import { Injectable, Autowired } from '@ali/common-di';
import { ElectronAppConfig, ICodeWindow, ICodeWindowOptions } from './types';
import { BrowserWindow, shell, ipcMain, BrowserWindowConstructorOptions } from 'electron';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { normalizedIpcHandlerPath } from '@ali/ide-core-common/lib/utils/ipc';
import { ExtensionCandiDate } from '@ali/ide-core-common';
import treeKill = require('tree-kill');
import { app } from 'electron';

const DEFAULT_WINDOW_HEIGHT = 700;
const DEFAULT_WINDOW_WIDTH = 1000;
let windowClientCount = 0;

@Injectable({multiple: true})
export class CodeWindow extends Disposable implements ICodeWindow {

  private _workspace: URI | undefined;

  @Autowired(ElectronAppConfig)
  private appConfig: ElectronAppConfig;

  private extensionDir: string = this.appConfig.extensionDir;

  private extensionCandidate: ExtensionCandiDate[] = [];

  private browser: BrowserWindow;

  private node: KTNodeProcess | null = null;

  private windowClientId: string;

  isReloading: boolean;

  public metadata: any;

  private _nodeReady = new Deferred<void>();

  private rpcListenPath: string | undefined = undefined;

  constructor(workspace?: string, metadata?: any, options: BrowserWindowConstructorOptions & ICodeWindowOptions = {}) {
    super();
    const defaultWebPreferences = {
      webviewTag: true,
    };
    this._workspace = new URI(workspace);
    this.metadata = metadata;
    this.windowClientId = 'CODE_WINDOW_CLIENT_ID:' + (++windowClientCount);

    this.browser = new BrowserWindow({
      show: false,
      webPreferences: {
        ...defaultWebPreferences,
        ...this.appConfig?.overrideWebPreferences,
        nodeIntegration: this.appConfig?.browserNodeIntegrated,
        preload: this.appConfig?.browserPreload,
      },
      frame: isOSX,
      titleBarStyle: 'hidden',
      height: DEFAULT_WINDOW_HEIGHT,
      width: DEFAULT_WINDOW_WIDTH,
      ...options,
    });
    if (options) {
      if (options.extensionDir) {
        this.extensionDir = options.extensionDir;
      }

      if (options.extensionCandidate) {
        this.extensionCandidate = options.extensionCandidate;
      }
    }

    this.browser.on('closed', () => {
      this.dispose();
    });
    const metadataResponser = async (event, windowId) => {
      await this._nodeReady.promise;
      if (windowId === this.browser.id) {
        event.returnValue = JSON.stringify({
          workspace: this.workspace ? FileUri.fsPath(this.workspace) : undefined,
          webview: {
            webviewPreload: URI.file(this.appConfig.webviewPreload).toString(),
            plainWebviewPreload: URI.file(this.appConfig.plainWebviewPreload).toString(),
          },
          extensionDir: this.extensionDir,
          extensionCandidate: this.appConfig.extensionCandidate.concat(this.extensionCandidate).filter(Boolean),
          ...this.metadata,
          windowClientId: this.windowClientId,
          rpcListenPath: this.rpcListenPath,
          workerHostEntry: this.appConfig.extensionWorkerEntry,
          appPath: app.getAppPath(),
        });
      }
    };
    ipcMain.on('window-metadata',  metadataResponser);
    this.addDispose({
      dispose: () => {
        ipcMain.removeListener('window-metadata', metadataResponser);
      },
    });

  }

  get workspace() {
    return this._workspace;
  }

  setWorkspace(workspace: string, fsPath?: boolean) {
    if (fsPath) {
      this._workspace = URI.file(workspace);
    } else {
      this._workspace = new URI(workspace);
    }
  }

  setExtensionDir(extensionDir: string) {
    this.extensionDir = URI.file(extensionDir).toString();
  }

  setExtensionCandidate(extensionCandidate: ExtensionCandiDate[]) {
    this.extensionCandidate = extensionCandidate;
  }

  async start() {
    this.clear();
    try {
      await this.startNode();
      getDebugLogger().log('starting browser window with url: ', this.appConfig.browserUrl);
      this.browser.loadURL(this.appConfig.browserUrl);
      this.browser.webContents.on('devtools-reload-page', () => {
        this.isReloading = true;
      });
      this.bindEvents();
    } catch (e) {
      getDebugLogger().error(e);
    }
  }

  async startNode() {
    if (this.node) {
      this.clear();
    }
    this._nodeReady = new Deferred();
    this.node = new KTNodeProcess(this.appConfig.nodeEntry, this.appConfig.extensionEntry, this.windowClientId, this.appConfig.extensionDir);
    this.rpcListenPath = normalizedIpcHandlerPath('electron-window', true);
    await this.node.start(this.rpcListenPath!, (this.workspace || '').toString());
    this._nodeReady.resolve();
  }

  bindEvents() {
    // 外部打开http
    this.browser.webContents.on('new-window',
      (event, url) => {
        if (!event.defaultPrevented) {
          event.preventDefault();
          if (url.indexOf('http') === 0) {
            shell.openExternal(url);
          }
        }
    });
  }

  clear() {
    if (this.node) {
      // TODO Dispose
      this.node.dispose();
      this.node = null;
    }
  }

  close() {
    if (this.browser) {
      this.browser.close();
    }
  }

  dispose() {
    this.clear();
    super.dispose();
  }

  getBrowserWindow() {
    return this.browser;
  }

  reload() {
    this.isReloading = true;
    this.browser.webContents.reload();
  }
}

export class KTNodeProcess {

  private _process: ChildProcess;

  private ready: Promise<void>;

  constructor(private forkPath, private extensionEntry, private windowClientId: string, private extensionDir: string) {

  }

  async start(rpcListenPath: string, workspace: string | undefined) {

    if (!this.ready) {
      this.ready = new Promise((resolve, reject) => {
        try {
          const forkOptions: ForkOptions = {
            env: {
              ... process.env,
              KTELECTRON: '1',
              ELECTRON_RUN_AS_NODE: '1',
              EXTENSION_HOST_ENTRY: this.extensionEntry,
              EXTENSION_DIR: this.extensionDir,
              CODE_WINDOW_CLIENT_ID: this.windowClientId,
            },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          };
          const forkArgs: string[] = [];
          forkOptions.env!.WORKSPACE_DIR = workspace;
          forkArgs.push('--listenPath', rpcListenPath);
          this._process = fork(this.forkPath, forkArgs, forkOptions);
          this._process.on('message', (message) => {
            if (message === 'ready') {
              resolve();
            }
          });
          this._process.on('error', (error) => {
            reject(error);
          });
          this._process.stdout.on('data', (data) => {
            data = data.toString();
            if (data.length > 500) {
              data = data.substr(500) + '...';
            }
            process.stdout.write('[node]' + data );
          });
          this._process.stderr.on('data', (data) => {
            data = data.toString();
            if (data.length > 500) {
              data = data.substr(500) + '...';
            }
            process.stdout.write('[node]' + data );
          });
        } catch (e) {
          reject(e);
        }
      });
    }
    return this.ready;

  }

  get process() {
    return this._process;
  }

  dispose() {
    const logger = getDebugLogger();
    logger.log('KTNodeProcess dispose', this._process);
    if (this._process) {
      treeKill(this._process.pid, (err) => {
        if (err) {
          logger.error(`tree kill error" \n ${err.message}`);
          return;
        }
      });
    }
  }
}
