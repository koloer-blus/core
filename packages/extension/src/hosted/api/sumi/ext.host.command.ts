import { IExtHostCommands, Handler, PermittedHandler, IExtensionDescription } from '../../../common/vscode';
import { ExtensionHostEditorService } from '../vscode/editor/editor.host';
import { createCommandsApiFactory as createVSCodeCommandsApiFactory } from '../vscode/ext.host.command';
import { Disposable } from '../../../common/vscode/ext-types';

export function createCommandsApiFactory(
  extHostCommands: IExtHostCommands,
  extHostEditors: ExtensionHostEditorService,
  extension: IExtensionDescription,
) {
  const vscodeCommands = createVSCodeCommandsApiFactory(extHostCommands, extHostEditors, extension);

  return {
    ...vscodeCommands,
    registerCommandWithPermit(id: string, handler: Handler, isPermitted: PermittedHandler): Disposable {
      return extHostCommands.registerCommand(true, id, {
        handler,
        isPermitted,
      });
    },
  };
}
