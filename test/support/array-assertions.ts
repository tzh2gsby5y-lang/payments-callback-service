export function expectSingle<T>(values: readonly T[], label = 'value'): T {
  expect(values).toHaveLength(1);
  const [value] = values;
  if (value === undefined) {
    throw new Error(`Expected one ${label}`);
  }

  return value;
}
