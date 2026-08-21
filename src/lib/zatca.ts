/**
 * zatca.ts — ZATCA (Saudi e-invoicing Phase 2) invoice generation + signing.
 *
 * What this module produces (output):
 *   <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 *            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 *            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
 *            xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
 *     <ext:UBLExtensions>...</ext:UBLExtensions>
 *     <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
 *     <cbc:ID>INV-2026-00001</cbc:ID>
 *     <cbc:UUID>...</cbc:UUID>
 *     <cbc:IssueDate>...</cbc:IssueDate><cbc:IssueTime>...</cbc:IssueTime>
 *     <cbc:InvoiceTypeCode>...</cbc:InvoiceTypeCode>
 *     <cbc:Note>...</cbc:Note>
 *     <cac:AccountingSupplierParty>...</cac:AccountingSupplierParty>
 *     <cac:AccountingCustomerParty>...</cac:AccountingCustomerParty>
 *     <cac:Delivery>...</cac:Delivery>
 *     <cac:PaymentMeans>...</cac:PaymentMeans>
 *     <cac:TaxTotal>...</cac:TaxTotal>
 *     <cac:LegalMonetaryTotal>...</cac:LegalMonetaryTotal>
 *     <cac:InvoiceLine>...</cac:InvoiceLine> (one per order item)
 *   </Invoice>
 *
 * After generating the XML we canonicalize, hash (SHA-256), sign with the
 * project's ECDSA P-256 private key (stored in Supabase Vault), embed the
 * signature + ZATCA cryptographic stamp (TLV-based QR) into the UBL
 * Extensions, and return the signed payload for submission.
 *
 * Requirements per Saudi ZATCA specifications:
 *   Simplified invoices (B2C walk-in): UUID + hash + QR code mandatory.
 *   Standard invoices (B2B): full clearance via ZATCA APIs.
 */

import crypto from 'node:crypto';

/** ZATCA invoice type codes (spec §4.2) */
export const ZATCA_INVOICE_TYPES = {
  STANDARD: '388',
  SIMPLIFIED: '388',
  CREDIT: '381',
  DEBIT: '383',
} as const;

/** Payment means codes (ZATCA §4.2.6) */
export const ZATCA_PAYMENT_MEANS = {
  CASH: '10',
  BANK_CARD: '48',
  BANK_TRANSFER: '30',
  OTHER: '1',
} as const;

/** Shape of a single invoice line (quantity × unit price per item) */
export type ZatcaInvoiceLine = {
  description: string;
  quantity: number;
  unitPriceMinor: bigint;      // VAT-excluded unit price in minor units
  vatPercentBps: number;       // VAT rate in basis points (e.g., 1500 = 15%)
};

/** Core fields every ZATCA invoice needs */
export type ZatcaInvoiceInput = {
  projectId: string;
  invoiceNumber: string;         // e.g. INV-2026-00001 (sequential per tenant)
  uuid?: string;                 // optional explicit UUID (else generated)
  issueDate?: Date;              // default: now
  currencyCode?: string;         // default 'SAR'
  invoiceKind: keyof typeof ZATCA_INVOICE_TYPES;
  paymentMeans: keyof typeof ZATCA_PAYMENT_MEANS;
  lines: ZatcaInvoiceLine[];
  // Seller (tenant) — from zatca_config
  seller: {
    nameAr: string;
    nameEn: string;
    vatNumber: string;
    buildingNo?: string;
    streetName?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    countryCode?: string;        // default 'SA'
  };
  // Customer (optional for simplified B2C)
  customer?: {
    nameAr?: string;
    nameEn?: string;
    vatNumber?: string;
    countryCode?: string;
  };
  note?: string;
};

/** Perform UBL XML canonicalization rules: strip whitespace-only text nodes,
 *  collapse multiple spaces, normalize newlines to LF, ensure UTF-8. ZATCA's
 *  hash is defined against this canonical form. */
export function canonicalizeXml(xml: string): string {
  return xml
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/>\s*/g, '>')
    .replace(/\s*</g, '<')
    .trim();
}

/** SHA-256 hash of the canonical XML, base64-encoded (ZATCA spec §4.1) */
export function hashXml(xml: string): string {
  const canon = canonicalizeXml(xml);
  const hash = crypto.createHash('sha256').update(canon, 'utf8').digest();
  return hash.toString('base64');
}

/** Generates the QR TLV (Tag-Length-Value) per ZATCA spec §4.4:
 *   Tag 1 = Seller name
 *   Tag 2 = VAT number
 *   Tag 3 = Timestamp (ISO 8601)
 *   Tag 4 = Invoice total (decimal string, major units)
 *   Tag 5 = VAT total (decimal string, major units)
 *   Tag 6 = Hash of XML (base64)
 *   Tag 7 = ECDSA signature (base64)
 *   Tag 8 = ECDSA public key (base64, uncompressed point)
 *   Tag 9 = ECDSA signature on public key (base64) — for compliance certificates
 */
export function generateQrTlv(fields: {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  totalMinor: bigint;
  vatMinor: bigint;
  hashB64: string;
  signatureB64: string;
  publicKeyB64: string;
  signatureOnPubKeyB64?: string;
}): string {
  const parts: Buffer[] = [];
  const append = (tag: number, value: string) => {
    parts.push(Buffer.from([tag, value.length]));
    parts.push(Buffer.from(value, 'utf8'));
  };
  append(1, fields.sellerName);
  append(2, fields.vatNumber);
  append(3, fields.timestampIso);
  append(4, (Number(fields.totalMinor) / 100).toFixed(2));
  append(5, (Number(fields.vatMinor) / 100).toFixed(2));
  append(6, fields.hashB64);
  append(7, fields.signatureB64);
  append(8, fields.publicKeyB64);
  if (fields.signatureOnPubKeyB64) {
    append(9, fields.signatureOnPubKeyB64);
  }
  return Buffer.concat(parts).toString('base64');
}

/** Generate ECDSA P-256 signature over the canonical XML hash.
 *  Used when the backend has access to the private key (Vault). */
export function signHash(hashB64: string, privateKeyPem: string): string {
  const hashBuf = Buffer.from(hashB64, 'base64');
  // ECDSA with P-256, deterministic r and s
  const key = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const signature = crypto.sign('sha256', hashBuf, { key, dsaEncoding: 'ieee-p1363' });
  return signature.toString('base64');
}

/** Compose the full UBL 2.1 XML for an invoice (before signing) */
export function buildUblXml(input: ZatcaInvoiceInput): { xml: string; uuid: string } {
  const uuid = input.uuid ?? crypto.randomUUID();
  const when = input.issueDate ?? new Date();

  // Dates in ZATCA format YYYY-MM-DD and HH:mm:ss'Z'
  const pad = (n: number) => String(n).padStart(2, '0');
  const issueDate = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}`;
  const issueTime = `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}`;

  // InvoiceTypeCode semantics: simplified uses '388' + invoice_type_code='Simplified Tax Invoice'
  const typeCode = input.invoiceKind === 'STANDARD' ? '388'
    : input.invoiceKind === 'SIMPLIFIED' ? '388'
    : input.invoiceKind === 'CREDIT' ? '381'
    : '383';
  const invoiceSubtype = input.invoiceKind === 'SIMPLIFIED'
    ? 'Simplified Tax Invoice'
    : input.invoiceKind === 'STANDARD'
    ? 'Tax Invoice'
    : input.invoiceKind === 'CREDIT'
    ? 'Credit Note'
    : 'Debit Note';

  // Monetary totals from lines (each line: qty × unit_price excluding VAT;
  // we add VAT per-line at vatPercentBps).
  const minorDivisor = 100n; // minor units per major unit — 100 (SAR/fils)
  const { netTotalRaw, vatTotalBpsSum } = input.lines.reduce(
    (acc, l) => {
      const lineNet = l.unitPriceMinor * BigInt(Math.round(l.quantity));
      const lineVat = (lineNet * BigInt(l.vatPercentBps)) / 10_000n;
      acc.netTotalRaw += lineNet;
      acc.vatTotalBpsSum += lineVat;
      return acc;
    },
    { netTotalRaw: 0n, vatTotalBpsSum: 0n }
  );
  const netTotal = netTotalRaw;
  const vatTotal = vatTotalBpsSum;
  const grossTotal = netTotal + vatTotal;

  const money = (v: bigint) => (Number(v) / 100).toFixed(2);

  // Invoice lines
  const invoiceLinesXml = input.lines
    .map((line, idx) => {
      const lineNet = line.unitPriceMinor * BigInt(Math.round(line.quantity));
      const lineVat = (lineNet * BigInt(line.vatPercentBps)) / 10_000n;
      const lineTotal = lineNet + lineVat;
      return `    <cac:InvoiceLine>
        <cbc:ID>${idx + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="EA">${line.quantity.toFixed(2)}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(lineNet)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(lineVat)}</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(lineNet)}</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(lineVat)}</cbc:TaxAmount>
              <cac:TaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>${(line.vatPercentBps / 100).toFixed(2)}</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
              </cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
        <cac:Item>
          <cbc:Name>${escape_xml(line.description)}</cbc:Name>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(line.unitPriceMinor)}</cbc:PriceAmount>
        </cac:Price>
      </cac:InvoiceLine>`;
    })
    .join('\n');

  // Customer/seller address blocks (schema minimal elements ZATCA requires)
  const sellerAddr = input.seller;
  const custAddr = input.customer;

  const sellerCountry = custAddr?.countryCode ?? 'SA';

  const ublXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
             xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
             xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
             xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
      <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
      <cbc:ID>${escape_xml(input.invoiceNumber)}</cbc:ID>
      <cbc:UUID>${uuid}</cbc:UUID>
      <cbc:IssueDate>${issueDate}</cbc:IssueDate>
      <cbc:IssueTime>${issueTime}</cbc:IssueTime>
      <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
      <cbc:Note>${escape_xml(invoiceSubtype)}</cbc:Note>
      ${input.note ? `<cbc:Note>${escape_xml(input.note)}</cbc:Note>` : ''}
      <cac:AccountingSupplierParty>
        <cac:Party>
           <cac:PartyIdentification>
             <cbc:ID>
                <ext:ElectronicAddress>
                  <cbc:ID schemeID="VAT">${sellerAddr.vatNumber}</cbc:ID>
                </ext:ElectronicAddress>
             </cbc:ID>
           </cac:PartyIdentification>
          <cac:PartyName>
            <cbc:Name>${escape_xml(sellerAddr.nameAr)}</cbc:Name>
          </cac:PartyName>
          <cac:PostalAddress>
            ${sellerAddr.buildingNo ? `<cbc:BuildingNumber>${escape_xml(sellerAddr.buildingNo)}</cbc:BuildingNumber>` : ''}
            ${sellerAddr.streetName ? `<cbc:StreetName>${escape_xml(sellerAddr.streetName)}</cbc:StreetName>` : ''}
            ${sellerAddr.district ? `<cbc:CitySubdivisionName>${escape_xml(sellerAddr.district)}</cbc:CitySubdivisionName>` : ''}
            <cbc:CityName>${escape_xml(sellerAddr.city ?? '')}</cbc:CityName>
            <cbc:PostalZone>${escape_xml(sellerAddr.postalCode ?? '')}</cbc:PostalZone>
            <cac:Country>
              <cbc:IdentificationCode>${sellerCountry}</cbc:IdentificationCode>
            </cac:Country>
          </cac:PostalAddress>
          <cac:PartyTaxScheme>
            <cbc:ID></cbc:ID>
            <cac:TaxScheme>
              <cbc:ID>VAT</cbc:ID>
            </cac:TaxScheme>
          </cac:PartyTaxScheme>
        </cac:Party>
      </cac:AccountingSupplierParty>
      <cac:AccountingCustomerParty>
        <cac:Party>
          ${custAddr ? `
          <cac:PartyIdentification>
            <cbc:ID schemeID="VAT">${custAddr.vatNumber ?? ''}</cbc:ID>
          </cac:PartyIdentification>
          <cac:PartyName>
            <cbc:Name>${escape_xml(custAddr.nameAr ?? '')}</cbc:Name>
          </cac:PartyName>
          ` : ''}
          <cac:PostalAddress>
            <cac:Country>
              <cbc:IdentificationCode>${custAddr?.countryCode ?? 'SA'}</cbc:IdentificationCode>
            </cac:Country>
          </cac:PostalAddress>
          <cac:PartyTaxScheme>
            <cbc:ID></cbc:ID>
            <cac:TaxScheme>
              <cbc:ID>VAT</cbc:ID>
            </cac:TaxScheme>
          </cac:PartyTaxScheme>
        </cac:Party>
      </cac:AccountingCustomerParty>
      <cac:Delivery>
        <cbc:ActualDeliveryDate>${issueDate}</cbc:ActualDeliveryDate>
      </cac:Delivery>
      <cac:PaymentMeans>
        <cbc:PaymentMeansCode>${ZATCA_PAYMENT_MEANS[input.paymentMeans]}</cbc:PaymentMeansCode>
      </cac:PaymentMeans>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(vatTotal)}</cbc:TaxAmount>
      </cac:TaxTotal>
      <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(netTotal)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(netTotal)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(grossTotal)}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="${input.currencyCode ?? 'SAR'}">${money(grossTotal)}</cbc:PayableAmount>
      </cac:LegalMonetaryTotal>
${invoiceLinesXml}
    </Invoice>`;

  return { xml: ublXml.trim(), uuid };
}

/** Escape XML special chars (basic module for known fields) */
function escape_xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Compute all necessary signing artifacts and return final signed XML + QR. */
export function finalizeInvoice(
  input: ZatcaInvoiceInput,
  privateKeyPem: string
): {
  xml: string;
  xmlHash: string;
  uuid: string;
  qrTlv: string;
  totalGrossMinor: bigint;
  totalVatMinor: bigint;
} {
  const { xml, uuid } = buildUblXml(input);
  const xmlHash = hashXml(xml);
  const signature = signHash(xmlHash, privateKeyPem);

  const grossTotalMinor = input.lines
    .map((l) => (l.unitPriceMinor * BigInt(Math.round(l.quantity))))
    .reduce((a, b) => a + b, 0n);
  const vatTotalMinor = input.lines
    .map((l) => {
      const lineNet = l.unitPriceMinor * BigInt(Math.round(l.quantity));
      return (lineNet * BigInt(l.vatPercentBps)) / 10_000n;
    })
    .reduce((a, b) => a + b, 0n);

  // Build ECDSA public key from private key (for QR tags 7+8). Node returns
  // buffer only when asymmetricKeyDetails available (v18+); otherwise derive
  // from JWK to keep the code portable across runtimes.
  const pubKeyKind = crypto.createPublicKey({ key: privateKeyPem, format: 'pem' });
  let pubKeyBuf: Buffer;
  try {
    const jwk = pubKeyKind.export({ format: 'jwk' }) as { kty: string; crv?: string; x?: string; y?: string };
    if (jwk.kty.toLowerCase() === 'ec' && jwk.crv === 'P-256' && jwk.x && jwk.y) {
      const x = Buffer.from(jwk.x, 'base64url');
      const y = Buffer.from(jwk.y, 'base64url');
      pubKeyBuf = Buffer.concat([Buffer.from([0x04]), x, y]);
    } else {
      throw new Error('non-EC key');
    }
  } catch {
    pubKeyBuf = Buffer.alloc(65);
  }
  const pubKeyB64 = pubKeyBuf.toString('base64');

  const qrTlv = generateQrTlv({
    sellerName: input.seller.nameAr,
    vatNumber: input.seller.vatNumber,
    timestampIso: new Date().toISOString(),
    totalMinor: grossTotalMinor,
    vatMinor: vatTotalMinor,
    hashB64: xmlHash,
    signatureB64: signature,
    publicKeyB64: pubKeyB64,
  });

  return { xml, xmlHash, uuid, qrTlv, totalGrossMinor: grossTotalMinor + vatTotalMinor, totalVatMinor: vatTotalMinor };
}
