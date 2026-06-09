import { Module } from '@nestjs/common';
import { PragmaticGspProvider } from './pragmatic-gsp.provider';

@Module({
  providers: [PragmaticGspProvider],
  exports: [PragmaticGspProvider],
})
export class PragmaticGspModule {}
