import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Invalid credentials' })
  @MaxLength(255)
  email!: string;

  // Limites amplos de proposito: validar formato de senha no login apenas
  // revelaria regras de senha a quem esta tentando adivinhar.
  @IsString({ message: 'Invalid credentials' })
  @MinLength(1, { message: 'Invalid credentials' })
  @MaxLength(200)
  password!: string;
}
