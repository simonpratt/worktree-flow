import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';
import { ParallelService } from '../parallel.js';
import { createMockConsole } from '../../test/test-utils.js';

describe('ParallelService', () => {
  let console: sinon.SinonStubbedInstance<any>;
  let service: ParallelService;

  beforeEach(() => {
    console = createMockConsole();
    service = new ParallelService(console as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('processInParallel', () => {
    it('should call processor for each item', async () => {
      const items = ['item1', 'item2', 'item3'];
      const getName = sinon.stub();
      getName.onCall(0).returns('item1');
      getName.onCall(1).returns('item2');
      getName.onCall(2).returns('item3');

      const processor = sinon.stub().resolves('processed');

      await service.processInParallel(items, getName, processor);

      expect(processor.callCount).toBe(3);
      sinon.assert.calledWith(processor.firstCall, 'item1', 'item1');
      sinon.assert.calledWith(processor.secondCall, 'item2', 'item2');
      sinon.assert.calledWith(processor.thirdCall, 'item3', 'item3');
    });

    it('should log success messages for successful items', async () => {
      const items = ['item1', 'item2'];
      const getName = (item: string) => item;
      const processor = sinon.stub();
      processor.onFirstCall().resolves('result1');
      processor.onSecondCall().resolves('result2');

      const successCount = await service.processInParallel(items, getName, processor);

      expect(successCount).toBe(2);
      expect(console.log.callCount).toBe(2);
      sinon.assert.calledWith(console.log.firstCall, sinon.match(/item1.*result1/));
      sinon.assert.calledWith(console.log.secondCall, sinon.match(/item2.*result2/));
    });

    it('should log error messages for failed items', async () => {
      const items = ['item1', 'item2'];
      const getName = (item: string) => item;
      const processor = sinon.stub();
      processor.onFirstCall().resolves('success');
      processor.onSecondCall().rejects(new Error('Processing failed'));

      const successCount = await service.processInParallel(items, getName, processor);

      expect(successCount).toBe(1);
      sinon.assert.calledOnce(console.log);
      sinon.assert.calledOnce(console.error);
      sinon.assert.calledWith(console.error, sinon.match(/item2.*Processing failed/));
    });

    it('should extract stderr from error when available', async () => {
      const items = ['item1'];
      const getName = (item: string) => item;
      const error: any = new Error('Error');
      error.stderr = 'stderr message';
      const processor = sinon.stub().rejects(error);

      await service.processInParallel(items, getName, processor);

      sinon.assert.calledWith(console.error, sinon.match(/stderr message/));
    });

    it('should handle empty items array', async () => {
      const items: string[] = [];
      const getName = sinon.stub();
      const processor = sinon.stub();

      const successCount = await service.processInParallel(items, getName, processor);

      expect(successCount).toBe(0);
      sinon.assert.notCalled(processor);
      sinon.assert.notCalled(console.log);
      sinon.assert.notCalled(console.error);
    });

    it('should call getName for each item', async () => {
      const items = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ];
      const getName = sinon.stub();
      getName.onFirstCall().returns('first');
      getName.onSecondCall().returns('second');
      const processor = sinon.stub().resolves('done');

      await service.processInParallel(items, getName, processor);

      expect(getName.callCount).toBe(2);
      sinon.assert.calledWith(getName.firstCall, items[0]);
      sinon.assert.calledWith(getName.secondCall, items[1]);
    });

    it('should count only successful operations', async () => {
      const items = ['item1', 'item2', 'item3', 'item4'];
      const getName = (item: string) => item;
      const processor = sinon.stub();
      processor.onCall(0).resolves('success');
      processor.onCall(1).rejects(new Error('fail'));
      processor.onCall(2).resolves('success');
      processor.onCall(3).rejects(new Error('fail'));

      const successCount = await service.processInParallel(items, getName, processor);

      expect(successCount).toBe(2);
      expect(console.log.callCount).toBe(2);
      expect(console.error.callCount).toBe(2);
    });
  });
});
