// J7-3: generate the tiny docx fidelity fixture at tests/fixtures/sample.docx.
// Run with: node scripts/gen-docx-fixture.mjs
// Uses the `docx` package (already a project dependency) to emit a real .docx
// containing: an H1, an H2, a paragraph with bold + italic runs, a 2-item bullet
// list, and a 2x2 table. Re-run this script if the fidelity fixture needs to change;
// the committed binary is the source of truth for the test.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'tests', 'fixtures', 'sample.docx')

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Sample Document' }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'A Section' }),
        new Paragraph({
          children: [
            new TextRun('This has '),
            new TextRun({ text: 'bold', bold: true }),
            new TextRun(' and '),
            new TextRun({ text: 'italic', italics: true }),
            new TextRun(' text.'),
          ],
        }),
        new Paragraph({ text: 'First bullet', bullet: { level: 0 } }),
        new Paragraph({ text: 'Second bullet', bullet: { level: 0 } }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('H1')] }),
                new TableCell({ children: [new Paragraph('H2')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('A1')] }),
                new TableCell({ children: [new Paragraph('B1')] }),
              ],
            }),
          ],
        }),
      ],
    },
  ],
})

const buf = await Packer.toBuffer(doc)
await mkdir(dirname(out), { recursive: true })
await writeFile(out, buf)
console.log(`wrote ${out} (${buf.length} bytes)`)
