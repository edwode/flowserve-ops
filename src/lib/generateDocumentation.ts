import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } from "docx";
import { saveAs } from "file-saver";

interface DiagramData {
  id: string;
  title: string;
  description: string;
  mermaid: string;
}

export const generateDocumentationWord = async (diagrams: DiagramData[]) => {
  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Calibri", size: 24 },
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: "EventOpsX System Documentation",
                bold: true,
                size: 56,
                color: "0D9488",
              }),
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          
          // Subtitle
          new Paragraph({
            children: [
              new TextRun({
                text: "Architecture & Workflows Reference",
                size: 28,
                color: "666666",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
          }),

          // Generation date
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated: ${new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}`,
                size: 22,
                color: "888888",
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 },
          }),

          // Overview Section
          new Paragraph({
            children: [
              new TextRun({ text: "Application Overview", bold: true, size: 32 }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          // Stats Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createStatCell("11", "User Roles"),
                  createStatCell("18", "Database Tables"),
                  createStatCell("7", "Order Statuses"),
                  createStatCell("4", "Station Types"),
                ],
              }),
            ],
          }),

          new Paragraph({
            children: [
              new TextRun({ text: "\nKey Architecture Features:", bold: true, size: 24 }),
            ],
            spacing: { before: 400, after: 200 },
          }),

          createBulletPoint("Zone-based staff assignment with multi-zone support for station roles"),
          createBulletPoint("Automatic inventory decrement on served status via database trigger"),
          createBulletPoint("Zone-scoped inventory allocation and transfer tracking"),
          createBulletPoint("Tenant-configurable currency with proper formatting"),
          createBulletPoint("Real-time updates via Supabase subscriptions"),
          createBulletPoint("Offline-tolerant waiter interface with request queuing"),

          // Page break before diagrams
          new Paragraph({
            children: [],
            pageBreakBefore: true,
          }),

          // Diagrams Section Header
          new Paragraph({
            children: [
              new TextRun({ text: "Architecture Diagrams", bold: true, size: 32 }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 400 },
          }),

          // Each diagram
          ...diagrams.flatMap((diagram, index) => [
            // Diagram title
            new Paragraph({
              children: [
                new TextRun({ 
                  text: `${index + 1}. ${diagram.title}`, 
                  bold: true, 
                  size: 28,
                  color: "0D9488",
                }),
              ],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: index > 0 ? 600 : 0, after: 100 },
            }),
            
            // Description
            new Paragraph({
              children: [
                new TextRun({ 
                  text: diagram.description, 
                  size: 22,
                  italics: true,
                  color: "666666",
                }),
              ],
              spacing: { after: 200 },
            }),

            // Mermaid code header
            new Paragraph({
              children: [
                new TextRun({ 
                  text: "Mermaid Diagram Code:", 
                  bold: true, 
                  size: 20,
                }),
              ],
              spacing: { before: 200, after: 100 },
            }),

            // Mermaid code block
            new Paragraph({
              children: [
                new TextRun({ 
                  text: diagram.mermaid, 
                  font: "Consolas",
                  size: 16,
                }),
              ],
              spacing: { after: 200 },
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              },
              shading: { fill: "F5F5F5" },
            }),

            // Usage note
            new Paragraph({
              children: [
                new TextRun({ 
                  text: "💡 Paste this code into mermaid.live or any Mermaid-compatible viewer to visualize.", 
                  size: 18,
                  color: "888888",
                }),
              ],
              spacing: { after: 400 },
            }),
          ]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "EventOpsX-System-Documentation.docx");
};

function createStatCell(value: string, label: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: value, bold: true, size: 36, color: "0D9488" }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: label, size: 18, color: "666666" }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    width: { size: 25, type: WidthType.PERCENTAGE },
    shading: { fill: "F0F0F0" },
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
  });
}

function createBulletPoint(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `• ${text}`, size: 22 }),
    ],
    spacing: { after: 100 },
    indent: { left: 400 },
  });
}
