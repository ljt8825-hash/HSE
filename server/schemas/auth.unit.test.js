const { loginSchema, registerSchema, changePasswordSchema, profileSchema } = require('./auth');

describe('auth schemas', () => {
  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: 'password123'
      });
      expect(result.success).toBe(true);
    });

    it('should fail when username is empty', () => {
      const result = loginSchema.safeParse({ username: '', password: 'pass' });
      expect(result.success).toBe(false);
    });

    it('should fail when password is empty', () => {
      const result = loginSchema.safeParse({ username: 'admin', password: '' });
      expect(result.success).toBe(false);
    });

    it('should fail when username is too long', () => {
      const result = loginSchema.safeParse({
        username: 'a'.repeat(51),
        password: 'password'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate valid register data', () => {
      const result = registerSchema.safeParse({
        username: 'newuser',
        realName: '新用户',
        password: 'Password123',
        email: 'test@example.com',
        phone: '13800138000',
        department: '安全部'
      });
      expect(result.success).toBe(true);
    });

    it('should fail with weak password (no lowercase)', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'PASSWORD123',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with weak password (no uppercase)', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with weak password (no number)', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'PasswordABC',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with too short password', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'Pa1',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with invalid email', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'Password1',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with missing realName', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        password: 'Password1',
      });
      expect(result.success).toBe(false);
    });

    it('should allow empty optional fields', () => {
      const result = registerSchema.safeParse({
        username: 'testuser',
        realName: '测试',
        password: 'Password1',
        email: '',
        phone: '',
        department: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate valid change password data', () => {
      const result = changePasswordSchema.safeParse({
        oldPassword: 'Oldpass123',
        newPassword: 'Newpass456'
      });
      expect(result.success).toBe(true);
    });

    it('should fail with weak new password', () => {
      const result = changePasswordSchema.safeParse({
        oldPassword: 'Oldpass123',
        newPassword: 'weak'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('profileSchema', () => {
    it('should validate valid profile update with email', () => {
      const result = profileSchema.safeParse({
        realName: '新名字',
        email: 'new@example.com'
      });
      expect(result.success).toBe(true);
    });

    it('should fail with empty object', () => {
      const result = profileSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should fail with invalid email', () => {
      const result = profileSchema.safeParse({
        email: 'bad-email'
      });
      expect(result.success).toBe(false);
    });

    it('should allow empty email string', () => {
      const result = profileSchema.safeParse({
        realName: '测试',
        email: ''
      });
      expect(result.success).toBe(true);
    });
  });
});
