import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AnalysisResponseDto } from './dto/analysis-response.dto.js';
import { StegoService } from './stego.service.js';

@ApiTags('steganography')
@ApiBearerAuth('bearer')
@Controller('steganography')
export class StegoController {
  constructor(private readonly stegoService: StegoService) {}

  @Post('analyze')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen PNG o BMP',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Analizar una imagen mediante esteganografía LSB',
  })
  @ApiResponse({ status: 201, type: AnalysisResponseDto })
  @ApiResponse({ status: 401, description: 'JWT inválido o expirado' })
  @ApiResponse({ status: 403, description: 'Denegado por AUTH' })
  @ApiResponse({ status: 413, description: 'Archivo o imagen demasiado grande' })
  @ApiResponse({ status: 415, description: 'Formato de archivo no soportado' })
  @ApiResponse({
    status: 422,
    description: 'Imagen no decodificable o variante BMP no soportada',
  })
  @ApiResponse({ status: 503, description: 'AUTH no disponible (Fail-Closed)' })
  async analyze(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<AnalysisResponseDto> {
    return this.stegoService.analyze(user, file);
  }

  @Get('results/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Consultar un resultado propio o autorizado mediante AUTH',
  })
  @ApiResponse({ status: 200, type: AnalysisResponseDto })
  @ApiResponse({ status: 403, description: 'Denegado por AUTH' })
  @ApiResponse({ status: 404, description: 'Resultado no encontrado' })
  @ApiResponse({ status: 503, description: 'AUTH no disponible (Fail-Closed)' })
  async getResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AnalysisResponseDto> {
    return this.stegoService.getResult(user, id);
  }
}
