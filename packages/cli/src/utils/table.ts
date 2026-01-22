/**
 * Simple text table formatter for CLI output
 */

export interface TableColumn {
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: number;
}

export interface TableOptions {
  columns: TableColumn[];
  rows: string[][];
}

/**
 * Format data as a text table with aligned columns
 */
export function formatTable(options: TableOptions): string {
  const { columns, rows } = options;

  if (columns.length === 0) {
    return '';
  }

  // Calculate column widths
  const widths = columns.map((col, i) => {
    const headerWidth = col.header.length;
    const maxRowWidth = Math.max(
      0,
      ...rows.map((row) => (row[i]?.length ?? 0))
    );
    return col.width ?? Math.max(headerWidth, maxRowWidth);
  });

  // Format a row with proper alignment
  const formatRow = (cells: string[]): string => {
    return columns
      .map((col, i) => {
        const cell = cells[i] ?? '';
        const width = widths[i] ?? 0;
        const align = col.align ?? 'left';
        return alignText(cell, width, align);
      })
      .join('  ');
  };

  // Build the table
  const lines: string[] = [];

  // Header
  lines.push(formatRow(columns.map((col) => col.header)));

  // Separator
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));

  // Rows
  for (const row of rows) {
    lines.push(formatRow(row));
  }

  return lines.join('\n');
}

/**
 * Align text within a specified width
 */
function alignText(text: string, width: number, align: 'left' | 'right' | 'center'): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }

  const padding = width - text.length;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}
