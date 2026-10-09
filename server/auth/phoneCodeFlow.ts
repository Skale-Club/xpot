type PhoneCodeVerificationSteps<T> = {
  validate: () => Promise<void>;
  complete: () => Promise<T>;
  consume: () => Promise<void>;
};

/**
 * Keeps a verified phone code retryable until the account/session work has
 * completed successfully. Validation failures and downstream failures are
 * allowed to propagate without consuming the code.
 */
export async function completePhoneCodeVerification<T>({
  validate,
  complete,
  consume,
}: PhoneCodeVerificationSteps<T>): Promise<T> {
  await validate();
  const result = await complete();
  await consume();
  return result;
}
