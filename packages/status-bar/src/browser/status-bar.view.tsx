import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './status-bar.module.less';
import { useInjectable } from '@opensumi/ide-core-browser/lib/react-hooks';
import { StatusBarItem } from './status-bar-item.view';
import { IStatusBarService } from '@opensumi/ide-core-browser/lib/services';
import cls from 'classnames';
import { generateCtxMenu, ICtxMenuRenderer } from '@opensumi/ide-core-browser/lib/menu/next';

export const StatusBarView = React.memo(
  observer(() => {
    const statusBar: IStatusBarService = useInjectable(IStatusBarService);
    const ctxMenuRenderer = useInjectable<ICtxMenuRenderer>(ICtxMenuRenderer);
    const backgroundColor = statusBar.getBackgroundColor();

    const handleCtxMenu = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      const result = generateCtxMenu({
        menus: statusBar.contextMenu,
        args: [],
      });

      ctxMenuRenderer.show({
        anchor: { x: e.clientX, y: e.clientY },
        menuNodes: result[1],
      });
    }, []);

    return (
      <div className={styles.statusBar} style={{ backgroundColor }} onContextMenu={handleCtxMenu}>
        <div className={cls(styles.area, styles.left)}>
          {statusBar.leftEntries.map((entry) => (
            <StatusBarItem key={entry.entryId} {...entry} />
          ))}
        </div>
        <div className={cls(styles.area, styles.right)}>
          {statusBar.rightEntries.map((entry) => (
            <StatusBarItem key={entry.entryId} {...entry} />
          ))}
        </div>
      </div>
    );
  }),
);
