const { generateSKUCombinations } = require('../src/services/product.service');

describe('SKU Generation — generateSKUCombinations', () => {
  test('produces correct cartesian product for all three dimensions', () => {
    const result = generateSKUCombinations({
      sizes: ['S', 'M'],
      colors: ['Black', 'White'],
      materials: ['Cotton'],
    });

    expect(result).toHaveLength(4);
    const skus = result.map((r) => r.sku);
    expect(skus).toEqual(
      expect.arrayContaining(['S-Black-Cotton', 'S-White-Cotton', 'M-Black-Cotton', 'M-White-Cotton'])
    );
  });

  test('attaches correct typed attributes to each variant', () => {
    const result = generateSKUCombinations({
      sizes: ['S'],
      colors: ['Red'],
      materials: ['Wool'],
    });

    expect(result[0]).toMatchObject({ sku: 'S-Red-Wool', size: 'S', color: 'Red', material: 'Wool' });
  });

  test('handles sizes × colors with no material', () => {
    const result = generateSKUCombinations({ sizes: ['S', 'M'], colors: ['Red'], materials: [] });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.sku)).toEqual(expect.arrayContaining(['S-Red', 'M-Red']));
    expect(result[0].material).toBeNull();
  });

  test('handles a single attribute dimension', () => {
    const result = generateSKUCombinations({ sizes: ['XL'], colors: [], materials: [] });
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('XL');
    expect(result[0].size).toBe('XL');
    expect(result[0].color).toBeNull();
    expect(result[0].material).toBeNull();
  });

  test('throws when all attribute arrays are empty', () => {
    expect(() =>
      generateSKUCombinations({ sizes: [], colors: [], materials: [] })
    ).toThrow('At least one attribute');
  });

  test('count matches dimensions product', () => {
    const result = generateSKUCombinations({
      sizes: ['S', 'M', 'L'],
      colors: ['Black', 'White'],
      materials: ['Cotton', 'Polyester'],
    });
    // 3 × 2 × 2 = 12
    expect(result).toHaveLength(12);
  });
});
