/**
 * Phone validation regex (E.164-ish)
 * Allows optional '+' prefix and 8-15 digits.
 */
export const PhoneRegex = /^\+?[0-9]{8,15}$/;

export function validatePhone(phone: string): boolean {
  return PhoneRegex.test(phone);
}
