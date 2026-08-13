/**
 * mock-tally-gateway — a local fake Tally gateway for manual testing.
 * Serves the sample XML fixtures on 127.0.0.1:9000 so you can exercise the
 * full read-only flow (connect → companies → parties → outstanding → vouchers
 * → dealer summary → SETU) without needing the real Tally machine.
 *
 *   node scripts/mock-tally-gateway.js          # starts on 127.0.0.1:9000
 *
 * Then (in another terminal) run verify + demo pointing TALLY_HOST/port at it.
 * This is for manual/dev testing ONLY — the final review demo must run against
 * the real gateway (192.168.0.72:9000).
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_TALLY_PORT || 9000);

const COMPANY_XML = `<ENVELOPE>
  <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC>
  <REQUESTDATA><TALLYMESSAGE>
  <COMPANY><COMPANYNAME>Bright Connection</COMPANYNAME><MASTERID>1</MASTERID></COMPANY>
  <COMPANY><COMPANYNAME>Bright Connection Pvt Ltd</COMPANYNAME><MASTERID>2</MASTERID></COMPANY>
  </TALLYMESSAGE></REQUESTDATA></EXPORTDATA></BODY>
</ENVELOPE>`;

const LEDGER_XML = `<ENVELOPE>
  <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Ledger</REPORTNAME></REQUESTDESC>
  <REQUESTDATA><TALLYMESSAGE>
  <LEDGER NAME="Sunrise Distributors" GUID="a1">
    <PARENT>Sundry Debtors</PARENT>
    <OPENINGBALANCE>5,000.00</OPENINGBALANCE>
    <CLOSINGBALANCE>12,500.00</CLOSINGBALANCE>
    <CREDITLIMIT>50,000.00</CREDITLIMIT>
    <GSTREGISTRATIONDETAILS.LIST><GSTIN>07AAACB1234F1Z5</GSTIN></GSTREGISTRATIONDETAILS.LIST>
  </LEDGER>
  <LEDGER NAME="Dhanush Traders" GUID="a2">
    <PARENT>Sundry Creditors</PARENT>
    <CLOSINGBALANCE>-8,000.00</CLOSINGBALANCE>
  </LEDGER>
  <LEDGER NAME="Mega Mart" GUID="a3">
    <PARENT>Sundry Debtors</PARENT>
    <CLOSINGBALANCE>45,200.00</CLOSINGBALANCE>
    <CREDITLIMIT>1,00,000.00</CREDITLIMIT>
    <GSTREGISTRATIONDETAILS.LIST><GSTIN>07AAACB5678F1Z7</GSTIN></GSTREGISTRATIONDETAILS.LIST>
  </LEDGER>
  </TALLYMESSAGE></REQUESTDATA></EXPORTDATA></BODY>
</ENVELOPE>`;

const OUTSTANDING_XML = `<ENVELOPE>
  <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Statement of Accounts</REPORTNAME></REQUESTDESC>
  <REQUESTDATA><TALLYMESSAGE>
  <LEDGER NAME="Sunrise Distributors"><PARENT>Sundry Debtors</PARENT>
    <BILLWISEDETAILS.LIST><NAME>INV-0991</NAME><BILLDATE>10-Jan-25</BILLDATE><DUEDATE>09-Feb-25</DUEDATE><AMOUNT>15,000.00</AMOUNT><RECEIVED>0.00</RECEIVED></BILLWISEDETAILS.LIST>
    <BILLWISEDETAILS.LIST><NAME>INV-0988</NAME><BILLDATE>02-Dec-24</BILLDATE><DUEDATE>01-Jan-25</DUEDATE><AMOUNT>20,000.00</AMOUNT><RECEIVED>0.00</RECEIVED></BILLWISEDETAILS.LIST>
  </LEDGER>
  <LEDGER NAME="Mega Mart"><PARENT>Sundry Debtors</PARENT>
    <BILLWISEDETAILS.LIST><NAME>INV-1101</NAME><BILLDATE>20-Jan-25</BILLDATE><DUEDATE>19-Feb-25</DUEDATE><AMOUNT>45,200.00</AMOUNT><RECEIVED>0.00</RECEIVED></BILLWISEDETAILS.LIST>
  </LEDGER>
  </TALLYMESSAGE></REQUESTDATA></EXPORTDATA></BODY>
</ENVELOPE>`;

const VOUCHER_XML = `<ENVELOPE>
  <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME></REQUESTDESC>
  <REQUESTDATA><TALLYMESSAGE>
  <VOUCHER VCHTYPE="Sales">
    <VOUCHERNUMBER>INV-1001</VOUCHERNUMBER>
    <DATE>05-Feb-25</DATE>
    <PARTYLEDGERNAME>Sunrise Distributors</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sunrise Distributors</LEDGERNAME><AMOUNT>25,000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <NARRATION>Sale of goods</NARRATION>
    <GSTDETAILS.LIST><GSTIN>07AAACB1234F1Z5</GSTIN><TAXABLEVALUE>21,186.44</TAXABLEVALUE><CGST>1,906.78</CGST><SGST>1,906.78</SGST></GSTDETAILS.LIST>
  </VOUCHER>
  <VOUCHER VCHTYPE="Receipt">
    <VOUCHERNUMBER>RCV-0411</VOUCHERNUMBER>
    <DATE>12-Jan-25</DATE>
    <PARTYLEDGERNAME>Sunrise Distributors</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sunrise Distributors</LEDGERNAME><AMOUNT>10,000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <NARRATION>Payment received</NARRATION>
  </VOUCHER>
  <VOUCHER VCHTYPE="Sales">
    <VOUCHERNUMBER>INV-1101</VOUCHERNUMBER>
    <DATE>20-Jan-25</DATE>
    <PARTYLEDGERNAME>Mega Mart</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Mega Mart</LEDGERNAME><AMOUNT>45,200.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <GSTDETAILS.LIST><GSTIN>07AAACB5678F1Z7</GSTIN><TAXABLEVALUE>38,305.08</TAXABLEVALUE><CGST>3,447.46</CGST><SGST>3,447.46</SGST></GSTDETAILS.LIST>
  </VOUCHER>
  </TALLYMESSAGE></REQUESTDATA></EXPORTDATA></BODY>
</ENVELOPE>`;

function pick(xml, reportName) {
  const re = new RegExp(`<REPORTNAME>([^<]+)</REPORTNAME>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function respondFor(body) {
  const name = pick(body, 'REPORTNAME');
  switch (name) {
    case 'List of Companies': return COMPANY_XML;
    case 'Ledger': return LEDGER_XML;
    case 'Statement of Accounts': return filterOutstandingByParty(body, OUTSTANDING_XML);
    case 'Voucher Register': return VOUCHER_XML;
    default: return COMPANY_XML;
  }
}

/** Statement of Accounts requests carry NATIVEMETHOD=Name=<party> — honour it. */
function filterOutstandingByParty(body, xml) {
  const party = (body.match(/<NATIVEMETHOD[^>]*>Name=([^<]*)/i) || [])[1];
  if (!party) return xml;
  const partyName = party.replace(/&amp;/g, '&').trim();
  const re = new RegExp(`<LEDGER[^>]*>([\\s\\S]*?<\\/LEDGER>)`, 'gi');
  const kept = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (new RegExp(`<LEDGER[^>]*NAME="${partyName.replace(/"/g, '\\"')}"`, 'i').test(m[0])) {
      kept.push(m[0]);
    }
  }
  if (!kept.length) return xml;
  return `<ENVELOPE>\n  <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Statement of Accounts</REPORTNAME></REQUESTDESC>\n  <REQUESTDATA><TALLYMESSAGE>\n  ${kept.join('\n  ')}\n  </TALLYMESSAGE></REQUESTDATA></EXPORTDATA></BODY>\n</ENVELOPE>`;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const xml = respondFor(body);
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(xml);
    const name = pick(body, 'REPORTNAME');
    console.log(`mock tally <- ${req.method} / (${name || 'unknown'}) -> ${xml.length} bytes`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MOCK Tally gateway listening on http://127.0.0.1:${PORT}`);
  console.log('Now point TALLY_HOST=127.0.0.1 TALLY_PORT=' + PORT + ' TALLY_ENABLED=true');
  console.log('Press Ctrl+C to stop.');
});