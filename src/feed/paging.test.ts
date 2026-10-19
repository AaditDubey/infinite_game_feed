import { pageAt, pageLayout, pageOffset } from './paging';

const HEIGHT = 800;

describe('pageAt', () => {
  it('turns a resting offset into its page', () => {
    expect(pageAt(0, HEIGHT, 5)).toBe(0);
    expect(pageAt(800, HEIGHT, 5)).toBe(1);
    expect(pageAt(3200, HEIGHT, 5)).toBe(4);
  });

  it('rounds an offset between pages to the nearest one', () => {
    expect(pageAt(399, HEIGHT, 5)).toBe(0);
    expect(pageAt(400, HEIGHT, 5)).toBe(1);
    expect(pageAt(1599.6, HEIGHT, 5)).toBe(2);
  });

  it('works with a height that is not a whole number', () => {
    const height = 812.33;
    expect(pageAt(height * 7, height, 10)).toBe(7);
  });

  it('stays within the list when it bounces past either end', () => {
    expect(pageAt(-60, HEIGHT, 5)).toBe(0);
    expect(pageAt(5000, HEIGHT, 5)).toBe(4);
  });

  it('settles on the first page before the list has been measured', () => {
    expect(pageAt(1200, 0, 5)).toBe(0);
  });
});

describe('pageOffset and pageLayout', () => {
  it('places each page one height below the one before', () => {
    expect(pageOffset(0, HEIGHT)).toBe(0);
    expect(pageOffset(3, HEIGHT)).toBe(2400);
  });

  it("gives FlatList each page's length and offset", () => {
    expect(pageLayout(HEIGHT, 3)).toEqual({ length: 800, offset: 2400, index: 3 });
  });
});
