export const PASSWORD_MESSAGE = 'パスワードは半角英字と数字を両方含む8文字以上の英数字にしてください。';
export function validPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,}(?![\s\S])/.test(value);
}
