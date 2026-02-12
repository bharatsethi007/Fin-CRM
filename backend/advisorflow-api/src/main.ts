import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow frontend (different port) to call this API
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
  });

  // Test that .env is loaded
  console.log('🔥 Environment Check:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- PORT:', process.env.PORT);
  console.log('- DATABASE_NAME:', process.env.DATABASE_NAME);
  console.log('- JWT_SECRET:', process.env.JWT_SECRET ? '✅ Loaded' : '❌ NOT LOADED');
  
  await app.listen(process.env.PORT || 3000);
  console.log(`🚀 Application is running on: http://localhost:${process.env.PORT || 3000}`);
}
bootstrap();