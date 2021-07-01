import { QuickOpenOptions, QuickOpenService, QuickOpenModel } from '../';
import { HideReason } from '@ali/ide-core-browser/lib/quick-open';
import { Injectable } from '@ali/common-di';
import { VALIDATE_TYPE } from '@ali/ide-core-browser/lib/components';

@Injectable()
export class MockQuickOpenService implements QuickOpenService {
  refresh(): void {
    throw new Error('Method not implemented.');
  }

  open(model: QuickOpenModel, options?: QuickOpenOptions): void {
    throw new Error('Method not implemented.');
  }
  hide(reason?: HideReason): void {
    throw new Error('Method not implemented.');
  }
  showDecoration(type: VALIDATE_TYPE): void {
    throw new Error('Method not implemented.');
  }
  hideDecoration(): void {
    throw new Error('Method not implemented.');
  }
}
