// The feed is a vertical list of pages, each exactly as tall as the list itself, so a page's
// position follows from its index alone.

// The page the list came to rest on, from its scroll offset. An offset between two pages rounds
// to the nearer one, and a bounce past either end stays on the first or last page. Before the
// list has been measured, its height is 0 and the answer is the first page.
export function pageAt(offset: number, height: number, count: number): number {
  if (height <= 0 || count <= 0) {
    return 0;
  }
  const index = Math.round(offset / height);
  return Math.min(Math.max(index, 0), count - 1);
}

// Where page `index` starts.
export function pageOffset(index: number, height: number): number {
  return index * height;
}

// For FlatList's getItemLayout: with every page the same height, the list can open on any page
// without measuring the ones before it.
export function pageLayout(
  height: number,
  index: number,
): { length: number; offset: number; index: number } {
  return { length: height, offset: pageOffset(index, height), index };
}
