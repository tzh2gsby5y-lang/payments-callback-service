import { Injectable } from '@nestjs/common';
import {
  ProviderCallbackIngestionCommand,
  ProviderCallbackIngestionResult,
  ProviderCallbackIngestionService,
} from '../../../provider-events/application/provider-callback-ingestion.service';
import { CallbackSources } from '../../../../shared/provider-events/domain/provider-callback-event';

export type IngestPspCallbackCommand = Omit<ProviderCallbackIngestionCommand, 'source'>;

@Injectable()
export class IngestPspCallbackUseCase {
  constructor(private readonly ingestion: ProviderCallbackIngestionService) {}

  async execute(command: IngestPspCallbackCommand): Promise<ProviderCallbackIngestionResult> {
    return this.ingestion.ingest({
      ...command,
      source: CallbackSources.PSP,
    });
  }
}
