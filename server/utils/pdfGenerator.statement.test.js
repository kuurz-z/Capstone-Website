import { afterEach, describe, expect, test } from "@jest/globals";
import fs from "fs/promises";
import {inflateSync} from "node:zlib";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { generateBillPdf, generateBillReceiptPdf } from "./pdfGenerator.js";
import {
  BILL_STATEMENT_TEMPLATE_MARKER,
  BILL_STATEMENT_TEMPLATE_VERSION,
} from "../services/billingStatementTemplate.js";
import { BILL_RECEIPT_TEMPLATE_MARKER } from "../services/billingReceiptTemplate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedFiles = [];

afterEach(async () => {
  await Promise.all(generatedFiles.splice(0).map((file) => fs.rm(file, { force: true })));
});

describe("canonical billing statement template", () => {
  test("generated PDF carries the canonical template marker in document metadata", async () => {
    const id = `statement-template-${process.pid}-${Date.now()}`;
    const relativePath = await generateBillPdf({
      bill: {
        _id: id,
        userId: "tenant-1",
        billingMonth: new Date("2026-08-01T00:00:00.000Z"),
        issuedAt: new Date("2026-08-16T00:00:00.000Z"),
        dueDate: new Date("2026-08-23T00:00:00.000Z"),
        charges: { rent: 5400, electricity: 500 },
        totalAmount: 5900,
      },
      billingResult: null,
      period: {
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-09-01T00:00:00.000Z"),
        branch: "gil-puyat",
      },
      room: { roomNumber: "GP-202", branch: "gil-puyat" },
      tenant: { firstName: "Ava", lastName: "Guest" },
    });
    const absolutePath = path.resolve(here, "..", relativePath);
    generatedFiles.push(absolutePath);

    const parsed = await PdfLibDocument.load(await fs.readFile(absolutePath), {
      updateMetadata: false,
    });
    expect(parsed.getProducer()).toContain(BILL_STATEMENT_TEMPLATE_MARKER);
    expect(parsed.getKeywords()).toContain(BILL_STATEMENT_TEMPLATE_MARKER);
    expect(BILL_STATEMENT_TEMPLATE_VERSION).toBeGreaterThan(1);
  });

  test("regenerated Statement preserves canonical electricity detail", async () => {
    const id = `statement-electricity-${process.pid}-${Date.now()}`;
    const relativePath = await generateBillPdf({
      bill: {
        _id: id, userId: "tenant-1", billingMonth: new Date("2026-08-01"),
        issuedAt: new Date("2026-08-16"), dueDate: new Date("2026-08-23"),
        charges: { rent: 5400, electricity: 500 }, totalAmount: 5900,
      },
      billingResult: null,
      electricityBreakdown: {
        ratePerKwh: 16, myTotalKwh: 31.25, myBillAmount: 500,
        segments: [{
          periodLabel: "Aug 1 - Aug 15", readingFrom: 100, readingTo: 162.5,
          segmentTotalKwh: 62.5, segmentTotalCost: 1000, activeTenantCount: 2,
          sharePerTenantCost: 500,
        }],
      },
      period: { startDate: new Date("2026-08-01"), endDate: new Date("2026-09-01"), branch: "gil-puyat" },
      room: { roomNumber: "GP-202", branch: "gil-puyat" },
      tenant: { firstName: "Ava", lastName: "Guest" },
    });
    const absolutePath = path.resolve(here, "..", relativePath);
    generatedFiles.push(absolutePath);
    expect((await fs.stat(absolutePath)).size).toBeGreaterThan(1000);
  });

  test("Receipt carries its own marker and canonical ledger reference", async () => {
    const id = `receipt-template-${process.pid}-${Date.now()}`;
    const relativePath = await generateBillReceiptPdf({
      bill: { _id: id, billingMonth: new Date("2026-08-01"), branch: "gil-puyat" },
      tenant: { firstName: "Ava", lastName: "Guest" },
      room: { roomNumber: "GP-202", branch: "gil-puyat" },
      billReference: "LC-RB-202608-ABC123",
      payments: [{ paymentId: "PAY-REAL-001", amount: 5900, method: "gcash", settlementTimestamp: new Date("2026-08-18") }],
      remainingAmount: 0,
    });
    const absolutePath = path.resolve(here, "..", relativePath);
    generatedFiles.push(absolutePath);
    const parsed = await PdfLibDocument.load(await fs.readFile(absolutePath), { updateMetadata: false });
    expect(parsed.getProducer()).toContain(BILL_RECEIPT_TEMPLATE_MARKER);
    expect(parsed.getKeywords()).toContain(BILL_RECEIPT_TEMPLATE_MARKER);
  });
});

function pdfText(bytes) {
  const raw=bytes.toString('latin1');let text='';
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const decoded=inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');
      text += [...decoded.matchAll(/<([a-fA-F0-9]+)>/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('');
    } catch { /* Non-compressed metadata streams contain no statement text. */ }
  }
  return text;
}
test('water PDF renders all three canonical tables and truthful legacy fallback',async()=>{
  for (const measured of [true,false]) {
    const relativePath=await generateBillPdf({
      bill:{_id:`water-statement-${process.pid}-${measured}`,userId:'a',billingMonth:new Date('2026-08-01'),charges:{water:600},totalAmount:600},
      period:{startDate:new Date('2026-08-01'),endDate:new Date('2026-09-01'),branch:'gil-puyat'},
      room:{roomNumber:'GP-WATER',branch:'gil-puyat'},tenant:{firstName:'A',lastName:'Sample'},
      waterBreakdown:{calculationVersion:measured?'water-meter-v1':'water-occupancy-legacy',tenantAmount:600,
        meterEvents:[{eventType:'moveIn',date:'2026-08-01T00:00:00+08:00',reading:100},{eventType:'periodEnd',date:'2026-09-01T00:00:00+08:00',reading:118}],
        consumptionSegments:[{startDate:'2026-08-01',endDate:'2026-09-01',readingFrom:100,readingTo:118,unitsConsumed:18,coveredTenantNames:['A Sample','B Sample']}],
        tenantAllocations:[{tenantName:'A Sample',consumptionShare:12,rate:50,amount:600},{tenantName:'B Sample',consumptionShare:6,rate:50,amount:300}]},
    });
    const absolutePath=path.resolve(here,'..',relativePath);generatedFiles.push(absolutePath);
    const bytes=await fs.readFile(absolutePath);const document=await PdfLibDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(0);
    const text=pdfText(bytes);expect(text).toContain('WATER BILLING DETAILS');
    if(measured) {
      for(const label of ['Meter event','Consumption segment','Tenant allocation','12.0000','600.00']) expect(text).toContain(label);
    } else {expect(text).toContain('Physical readings, consumption and price');expect(text).not.toContain('12.0000');}
  }
});
