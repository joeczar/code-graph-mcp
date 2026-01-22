import { describe, it, expect } from 'vitest';
import { formatTable } from '../table.js';

describe('formatTable', () => {
  it('formats a simple table', () => {
    const result = formatTable({
      columns: [
        { header: 'Name' },
        { header: 'Age' },
        { header: 'City' },
      ],
      rows: [
        ['Alice', '30', 'NYC'],
        ['Bob', '25', 'LA'],
        ['Charlie', '35', 'Chicago'],
      ],
    });

    expect(result).toBe(
      'Name     Age  City   \n' +
      '-------  ---  -------\n' +
      'Alice    30   NYC    \n' +
      'Bob      25   LA     \n' +
      'Charlie  35   Chicago'
    );
  });

  it('handles right-aligned columns', () => {
    const result = formatTable({
      columns: [
        { header: 'Item', align: 'left' },
        { header: 'Count', align: 'right' },
        { header: 'Price', align: 'right' },
      ],
      rows: [
        ['Apple', '10', '$1.50'],
        ['Banana', '5', '$0.75'],
        ['Orange', '100', '$2.00'],
      ],
    });

    expect(result).toBe(
      'Item    Count  Price\n' +
      '------  -----  -----\n' +
      'Apple      10  $1.50\n' +
      'Banana      5  $0.75\n' +
      'Orange    100  $2.00'
    );
  });

  it('handles center-aligned columns', () => {
    const result = formatTable({
      columns: [
        { header: 'Status', align: 'center' },
      ],
      rows: [
        ['OK'],
        ['FAIL'],
        ['PENDING'],
      ],
    });

    expect(result).toBe(
      'Status \n' +
      '-------\n' +
      '  OK   \n' +
      ' FAIL  \n' +
      'PENDING'
    );
  });

  it('handles custom column widths', () => {
    const result = formatTable({
      columns: [
        { header: 'Name', width: 10 },
        { header: 'Value', width: 5 },
      ],
      rows: [
        ['Short', '123'],
        ['VeryLongName', '45678'],
      ],
    });

    expect(result).toBe(
      'Name        Value\n' +
      '----------  -----\n' +
      'Short       123  \n' +
      'VeryLongNa  45678'
    );
  });

  it('handles empty rows', () => {
    const result = formatTable({
      columns: [
        { header: 'Col1' },
        { header: 'Col2' },
      ],
      rows: [],
    });

    expect(result).toBe(
      'Col1  Col2\n' +
      '----  ----'
    );
  });

  it('handles missing cell values', () => {
    const result = formatTable({
      columns: [
        { header: 'A' },
        { header: 'B' },
        { header: 'C' },
      ],
      rows: [
        ['1', '2', '3'],
        ['4', '5'],
        ['6'],
      ],
    });

    expect(result).toBe(
      'A  B  C\n' +
      '-  -  -\n' +
      '1  2  3\n' +
      '4  5   \n' +
      '6      '
    );
  });

  it('returns empty string for no columns', () => {
    const result = formatTable({
      columns: [],
      rows: [['data']],
    });

    expect(result).toBe('');
  });

  it('handles mixed width content', () => {
    const result = formatTable({
      columns: [
        { header: 'Short' },
        { header: 'VeryLongHeader' },
      ],
      rows: [
        ['A', 'B'],
        ['CD', 'EF'],
      ],
    });

    expect(result).toBe(
      'Short  VeryLongHeader\n' +
      '-----  --------------\n' +
      'A      B             \n' +
      'CD     EF            '
    );
  });
});
