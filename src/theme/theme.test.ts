import { theme } from './theme';

describe('theme', () => {
  it('defines every color as a #RRGGBB hex string', () => {
    for (const color of Object.values(theme.colors)) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
