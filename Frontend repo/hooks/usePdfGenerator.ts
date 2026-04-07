// ================================================================
// PDF GENERATOR HOOK v2
// - Preview modal before download
// - Cached in generated_documents table
// - Only regenerates when application data hash changes
// - Uses firm/advisor settings for branding
// ================================================================

import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';

export type PdfDocType = 'soa_full' | 'disclosure_statement' | 'needs_objectives';

export interface PdfPreview {
  docId: string | null;
  docType: PdfDocType;
  title: string;
  applicationId: string;
  pdfDataUrl: string;      // blob URL for <iframe> preview
  pdfBlob: Blob;
  data: any;
  cached: boolean;
  generatedAt: string;
}

interface UsePdfResult {
  generating: boolean;
  preview: PdfPreview | null;
  error: string | null;
  generate: (applicationId: string, docType: PdfDocType, forceRegen?: boolean) => Promise<void>;
  closePreview: () => void;
  approve: (docId: string) => Promise<void>;
  download: () => void;
}

// Simple hash of key application data fields
function hashData(d: any): string {
  const key = [
    d.loan_amount, d.property_value, d.total_income,
    d.total_expenses, d.passes_svc, d.umi_monthly,
    d.dti_ratio, d.lvr_percent, d.readiness_grade,
  ].join('|');
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h) + key.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

function fmtM(v: any) { return v ? '$' + Math.round(Number(v)).toLocaleString('en-NZ') : '$0'; }
function fmtP(v: any) { return v != null ? Number(v).toFixed(1) + '%' : '—'; }
function fmtX(v: any) { return v != null ? Number(v).toFixed(1) + 'x' : '—'; }
function hexRgb(h: string): [number,number,number] {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function lighten(rgb: [number,number,number]): [number,number,number] {
  return [Math.round(rgb[0]*0.12+224), Math.round(rgb[1]*0.12+224), Math.round(rgb[2]*0.12+224)];
}

// ── PDF BUILDER ─────────────────────────────────────────────────
function buildPdf(d: any, docType: PdfDocType): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 20, usable = 170;
  const brand = hexRgb(d.firm_brand_color || '#4f46e5');
  const bl = lighten(brand);
  const slate9: [number,number,number] = [15,23,42];
  const slate7: [number,number,number] = [51,65,85];
  const slate5: [number,number,number] = [100,116,139];
  const green: [number,number,number] = [5,150,105];
  const red: [number,number,number] = [220,38,38];
  const amber: [number,number,number] = [217,119,6];
  const greenBg: [number,number,number] = [240,253,244];
  const redBg: [number,number,number] = [254,242,242];
  const amberBg: [number,number,number] = [255,251,235];

  const docTitles: Record<PdfDocType, string> = {
    soa_full: 'Statement of Advice',
    disclosure_statement: 'Financial Adviser Disclosure Statement',
    needs_objectives: 'Needs and Objectives Statement',
  };
  const docTitle = docTitles[docType];
  let page = 1;

  function hdr() {
    pdf.setFillColor(...slate9); pdf.rect(0,0,W,15,'F');
    pdf.setFillColor(...brand); pdf.rect(0,15,W,1,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5);
    pdf.text(d.firm_name||'', M, 10);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8);
    pdf.text(docTitle, W/2, 10, {align:'center'});
    pdf.text('CONFIDENTIAL', W-M, 10, {align:'right'});
  }
  function ftr(total: number) {
    pdf.setDrawColor(203,213,225); pdf.setLineWidth(0.3); pdf.line(M,H-13,W-M,H-13);
    pdf.setTextColor(...slate5); pdf.setFont('helvetica','normal'); pdf.setFontSize(7);
    pdf.text(`${d.advisor_name||''} · ${d.doc_date||''} · ${d.firm_name||''}`, M, H-9);
    pdf.text('AI-assisted — reviewed by licensed financial adviser', W/2, H-9, {align:'center'});
    pdf.text(`Page ${page} of ${total}`, W-M, H-9, {align:'right'});
  }
  function secHdr(y: number, txt: string): number {
    pdf.setFillColor(...bl); pdf.roundedRect(M,y,usable,7.5,1,1,'F');
    pdf.setTextColor(...brand); pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5);
    pdf.text(txt.toUpperCase(), M+5, y+5.5);
    return y+11;
  }
  function card(x:number, y:number, w:number, lbl:string, val:string, sub:string|null,
    vc:[number,number,number]=slate9, bg:[number,number,number]=[241,245,249]) {
    pdf.setFillColor(...bg); pdf.roundedRect(x,y,w,21,2,2,'F');
    pdf.setTextColor(...slate5); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
    pdf.text(lbl.toUpperCase(), x+4, y+5);
    pdf.setTextColor(...vc); pdf.setFont('helvetica','bold'); pdf.setFontSize(13);
    pdf.text(val, x+4, y+14);
    if(sub){pdf.setTextColor(...slate5); pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.text(sub,x+4,y+19);}
  }

  const totalPages = docType === 'soa_full' ? 5 : 2;

  // ── COVER ────────────────────────────────────────────────────
  hdr();
  let y = 28;
  pdf.setTextColor(...brand); pdf.setFont('helvetica','bold'); pdf.setFontSize(11);
  pdf.text(d.firm_name||'', M, y); y+=7;
  pdf.setTextColor(...slate9); pdf.setFontSize(24);
  pdf.text(docTitle, M, y); y+=8;
  pdf.setFillColor(...brand); pdf.rect(M,y,35,2,'F'); y+=8;
  pdf.setTextColor(...slate7); pdf.setFont('helvetica','normal'); pdf.setFontSize(11);
  pdf.text('Prepared for: ', M, y); pdf.setFont('helvetica','bold'); pdf.text(d.client_name||'', M+26, y); y+=7;
  pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(...slate5);
  pdf.text(`Date: ${d.doc_date||''}   ·   Adviser: ${d.advisor_name||''}`, M, y); y+=5;
  if(d.advisor_fsp) { pdf.text(`FSP: ${d.advisor_fsp}   ·   FAP Auth: ${d.advisor_fap_auth||'—'}   ·   Licence: ${d.advisor_licence_status||'—'}`, M, y); y+=5; }
  if(d.firm_address) { pdf.text(d.firm_address, M, y); y+=5; }
  y+=8;

  // Cover summary table
  autoTable(pdf, {
    startY: y,
    head: [['Loan Amount','Property Value','LVR','Serviceability','Readiness']],
    body: [[fmtM(d.loan_amount), fmtM(d.property_value), fmtP(d.lvr_percent),
      d.passes_svc ? 'PASSES ✓' : 'REVIEW REQUIRED ⚠', d.readiness_grade||'—']],
    headStyles: {fillColor:slate9, textColor:255, fontSize:8.5, fontStyle:'bold'},
    bodyStyles: {fillColor:bl, fontSize:10, fontStyle:'bold', textColor:slate9},
    columnStyles: {3:{textColor: d.passes_svc ? green : red}},
    margin: {left:M, right:M}, tableWidth: usable,
  });
  y = (pdf as any).lastAutoTable.finalY + 8;

  // Notice box
  pdf.setFillColor(255,251,235); pdf.setDrawColor(253,230,138);
  pdf.roundedRect(M,y,usable,16,2,2,'FD');
  pdf.setTextColor(146,64,14); pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5);
  pdf.text('IMPORTANT NOTICE', M+5, y+6);
  pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5);
  const nt = `This document was prepared by ${d.advisor_name||'a licensed financial adviser'} of ${d.firm_name||''}. AI-assisted tools were used under adviser supervision and do not constitute automated advice. Intended solely for ${d.client_name||'the named recipient'}.`;
  pdf.text(pdf.splitTextToSize(nt, usable-10), M+5, y+11);
  ftr(totalPages);

  if(docType === 'disclosure_statement') {
    pdf.addPage(); page++;
    hdr(); y=25;
    y = secHdr(y, '1. Financial Adviser Details');
    autoTable(pdf, {
      startY: y,
      body: [
        ['Adviser Name', d.advisor_name||'', 'Title', d.advisor_title||'Financial Adviser'],
        ['FSP Number', d.advisor_fsp||'—', 'FAP Auth Number', d.advisor_fap_auth||'—'],
        ['Licence Status', d.advisor_licence_status||'—', 'Licence Expiry', d.advisor_licence_expiry||'—'],
        ['Email', d.advisor_email||'', 'Phone', d.advisor_phone||''],
        ['Financial Advice Provider', d.fap_name||d.firm_name||'', 'FAP Licence', d.fap_licence_number||'—'],
        ['Firm Address', d.firm_address||'', 'Website', d.firm_website||''],
        ['Lender Panel', (d.lender_panel||[]).join(', '), '', ''],
        ['Complaints Body', d.disputes_scheme||'FSCL', 'Complaints URL', d.complaints_url||''],
      ],
      columnStyles: {0:{fontStyle:'bold',textColor:slate5,cellWidth:38},1:{cellWidth:62},2:{fontStyle:'bold',textColor:slate5,cellWidth:28},3:{cellWidth:42}},
      bodyStyles: {fontSize:8.5, textColor:slate7},
      alternateRowStyles: {fillColor:[248,250,252]},
      margin: {left:M, right:M}, tableWidth: usable,
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
    y = secHdr(y, '2. Nature and Scope of Advice');
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(...slate7);
    const scope = `${d.advisor_name||'Your adviser'} will provide you with personalised financial advice about mortgage products from our lender panel. Our advice is based on your individual circumstances, goals, and financial position assessed in accordance with the Financial Markets Conduct Act 2013.`;
    pdf.text(pdf.splitTextToSize(scope, usable), M, y); y += 18;
    y = secHdr(y, '3. Fees and Conflicts of Interest');
    const fees = `Our financial advice is provided at no direct cost to you. ${d.firm_name||''} receives commission from lenders when a loan settles. Commission rates vary by lender and product. This creates a potential conflict of interest which we manage by always acting in your best interest.`;
    pdf.text(pdf.splitTextToSize(fees, usable), M, y); y += 18;
    y = secHdr(y, '4. Signature');
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5);
    pdf.text('By signing below, you confirm receipt of this Disclosure Statement.', M, y); y += 12;
    pdf.setDrawColor(...slate5 as [number,number,number]); pdf.line(M,y+10,M+75,y+10); pdf.line(M+90,y+10,M+165,y+10);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(...slate5);
    pdf.text(d.client_name||'Client', M, y+16); pdf.text('Date', M+90, y+16);
    ftr(totalPages);
    return pdf;
  }

  if(docType === 'needs_objectives') {
    const no = d.needs_objectives || d.needs_objectives_draft || {};
    pdf.addPage(); page++;
    hdr(); y=25;
    y = secHdr(y, '1. Primary Objective');
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(...slate7);
    pdf.text(pdf.splitTextToSize(no.primary_objective||'Not documented', usable), M, y); y+=15;
    if(no.needs_identified?.length) {
      y = secHdr(y, '2. Identified Needs');
      no.needs_identified.forEach((n: string) => { pdf.text(`• ${n}`, M+3, y); y+=6; });
      y+=4;
    }
    y = secHdr(y, '3. Why This Loan Type');
    pdf.text(pdf.splitTextToSize(no.why_this_loan_type||d.loan_purpose||'—', usable), M, y); y+=15;
    y = secHdr(y, '4. Alternatives Considered');
    pdf.text(pdf.splitTextToSize(no.alternatives_considered||'Standard mortgage products were considered', usable), M, y); y+=12;
    if(no.risk_acknowledgements?.length) {
      y = secHdr(y, '5. Risk Acknowledgements');
      no.risk_acknowledgements.forEach((r: string) => { pdf.text(`• ${r}`, M+3, y); y+=6; });
      y+=4;
    }
    y = secHdr(y, '6. CCCFA Affordability Statement');
    pdf.text(pdf.splitTextToSize(no.cccfa_affordability_note || `An affordability assessment was conducted in accordance with the Credit Contracts and Consumer Finance Act 2003. The adviser has verified income, assessed expenses against the Household Expenditure Measure, and stress-tested repayments at 8.5%.`, usable), M, y); y+=20;
    // Signatures
    pdf.setDrawColor(...slate5 as [number,number,number]);
    pdf.line(M,y+10,M+75,y+10); pdf.line(M+90,y+10,M+165,y+10);
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); pdf.setTextColor(...slate7);
    pdf.text(d.client_name||'Client', M, y+16); pdf.text(d.advisor_name||'Adviser', M+90, y+16);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(...slate5);
    pdf.text('Client Signature', M, y+21); pdf.text('Licensed Financial Adviser', M+90, y+21);
    ftr(totalPages);
    return pdf;
  }

  // ── SOA FULL ─────────────────────────────────────────────────
  // Page 2: Adviser + Client + Financials
  pdf.addPage(); page++;
  hdr(); y=25;
  y = secHdr(y, '1. Your Financial Adviser');
  autoTable(pdf, {
    startY: y,
    body: [
      ['Adviser', d.advisor_name||'', 'Title', d.advisor_title||'Financial Adviser'],
      ['FSP Number', d.advisor_fsp||'—', 'FAP Auth', d.advisor_fap_auth||'—'],
      ['Licence', d.advisor_licence_status||'—', 'Expiry', d.advisor_licence_expiry||'—'],
      ['Email', d.advisor_email||'', 'Phone', d.advisor_phone||''],
      ['FAP Name', d.fap_name||d.firm_name||'', 'FAP Licence', d.fap_licence_number||'—'],
      ['Firm Address', d.firm_address||'', 'Website', d.firm_website||''],
      ['Lender Panel', (d.lender_panel||[]).join(', '), '', ''],
    ],
    columnStyles: {0:{fontStyle:'bold',textColor:slate5,cellWidth:30},1:{cellWidth:55},2:{fontStyle:'bold',textColor:slate5,cellWidth:25},3:{cellWidth:60}},
    bodyStyles: {fontSize:8, textColor:slate7},
    alternateRowStyles: {fillColor:[248,250,252]},
    margin: {left:M, right:M}, tableWidth: usable,
  });
  y = (pdf as any).lastAutoTable.finalY + 6;
  y = secHdr(y, '2. Client Profile');
  autoTable(pdf, {
    startY: y,
    body: [
      ['Client Name', d.client_name||'', 'Email', d.client_email||''],
      ['Phone', d.client_phone||'', 'Application Type', (d.application_type||'').replace(/-/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())],
      ['Loan Purpose', d.loan_purpose||'', 'Loan Term', `${d.loan_term_years||30} years`],
      ['Property', d.property_address||'', 'Property Value', fmtM(d.property_value)],
    ],
    columnStyles: {0:{fontStyle:'bold',textColor:slate5,cellWidth:30},1:{cellWidth:55},2:{fontStyle:'bold',textColor:slate5,cellWidth:25},3:{cellWidth:60}},
    bodyStyles: {fontSize:8, textColor:slate7},
    alternateRowStyles: {fillColor:[248,250,252]},
    margin: {left:M, right:M}, tableWidth: usable,
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Financial metric cards
  const cw = (usable-9)/4;
  const totalInc = Number(d.total_income||0);
  const totalExpM = Number(d.total_expenses||0);
  const netWorth = Number(d.total_assets||0) - Number(d.total_liabilities||0);
  card(M, y, cw, 'Annual Income', fmtM(totalInc), fmtM(totalInc/12)+'/mth');
  card(M+cw+3, y, cw, 'Monthly Expenses', fmtM(totalExpM), 'Declared household');
  card(M+(cw+3)*2, y, cw, 'Total Assets', fmtM(d.total_assets), 'Incl. property');
  card(M+(cw+3)*3, y, cw, 'Net Worth', fmtM(netWorth), 'Assets minus debts',
    netWorth>=0?green:red, netWorth>=0?greenBg:redBg);
  y+=25;

  // Income table
  if(d.income_items?.length) {
    autoTable(pdf, {
      startY: y,
      head: [['Income Source','Type','Frequency','Annual Gross']],
      body: d.income_items.map((i:any) => [
        i.description||i.income_type||'—',
        (i.income_type||'').replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase()),
        (i.frequency||'Annual').replace(/\b\w/g,(c:string)=>c.toUpperCase()),
        fmtM(i.annual_gross_total),
      ]),
      foot:[['','','Total',fmtM(totalInc)]],
      headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
      footStyles:{fillColor:bl,textColor:slate9,fontStyle:'bold',fontSize:8},
      bodyStyles:{fontSize:8, textColor:slate7},
      alternateRowStyles:{fillColor:[248,250,252]},
      columnStyles:{3:{halign:'right'}},
      margin:{left:M,right:M}, tableWidth:usable,
    });
    y = (pdf as any).lastAutoTable.finalY + 4;
  }

  // Expenses
  if(d.expense_items) {
    const expRows = Object.entries(d.expense_items)
      .filter(([k,v]) => k!=='total_monthly' && Number(v)>0)
      .map(([k,v]) => [k.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase()), fmtM(v)+'/mth']);
    if(expRows.length) {
      autoTable(pdf, {
        startY: y,
        head:[['Expense Category','Monthly']],
        body: expRows,
        foot:[['Total Monthly Expenses', fmtM(d.expense_items.total_monthly||totalExpM)+'/mth']],
        headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
        footStyles:{fillColor:bl,textColor:slate9,fontStyle:'bold',fontSize:8},
        bodyStyles:{fontSize:8,textColor:slate7},
        alternateRowStyles:{fillColor:[248,250,252]},
        columnStyles:{1:{halign:'right'}},
        margin:{left:M,right:M}, tableWidth:usable,
      });
    }
  }
  ftr(totalPages);

  // Page 3: Serviceability
  pdf.addPage(); page++;
  hdr(); y=25;
  y = secHdr(y, '3. Serviceability Assessment');
  const pass = d.passes_svc;
  pdf.setFillColor(...(pass?greenBg:redBg)); pdf.setDrawColor(...(pass?[167,243,208]:[254,202,202]) as [number,number,number]);
  pdf.roundedRect(M,y,usable,11,2,2,'FD');
  pdf.setTextColor(...(pass?green:red)); pdf.setFont('helvetica','bold'); pdf.setFontSize(10);
  pdf.text(pass?'✓  PASSES SERVICEABILITY AT 8.5% STRESS RATE':'⚠  FAILS SERVICEABILITY — REVIEW REQUIRED BEFORE SUBMISSION', M+7, y+7.5);
  y+=16;

  const umi=Number(d.umi_monthly||0), dti=Number(d.dti_ratio||0), lvr=Number(d.lvr_percent||0);
  const cw2=(usable-9)/4;
  card(M,y,cw2,'UMI Monthly Buffer',fmtM(umi),'After all commitments',
    umi>=1000?green:umi>=0?amber:red, umi>=0?greenBg:redBg);
  card(M+cw2+3,y,cw2,'DTI Ratio',fmtX(dti),'RBNZ limit: 6x',
    dti<=5?green:dti<=6?amber:red, dti<=5?greenBg:dti<=6?amberBg:redBg);
  card(M+(cw2+3)*2,y,cw2,'LVR',fmtP(lvr),'80% threshold',
    lvr<=80?green:lvr<=90?amber:red, lvr<=80?greenBg:lvr<=90?amberBg:redBg);
  card(M+(cw2+3)*3,y,cw2,'Stress Rate','8.50%','Applied assessment rate');
  y+=26;

  // Lender eligibility
  if(d.lender_scores) {
    autoTable(pdf, {
      startY:y,
      head:[['Lender','Eligibility','Match Score','Best Rate','Cashback']],
      body: d.lender_scores.map((ls:any) => [
        ls.name, ls.eligible?'✓ Eligible':'✗ Not eligible',
        `${ls.score||0}/100`, ls.rate?`${Number(ls.rate).toFixed(2)}%`:'—', ls.cashback?fmtM(ls.cashback):'—'
      ]),
      headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
      bodyStyles:{fontSize:9,textColor:slate7},
      alternateRowStyles:{fillColor:[248,250,252]},
      didParseCell:(h:any)=>{
        if(h.section==='body'&&h.column.index===1)
          h.cell.styles.textColor = h.cell.raw?.includes('✓')?green:red;
      },
      margin:{left:M,right:M}, tableWidth:usable,
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // HEM comparison
  autoTable(pdf, {
    startY:y,
    head:[['Affordability Comparison','Monthly Amount','Notes']],
    body:[
      ['Declared Expenses', fmtM(totalExpM), 'As provided by client'],
      ['HEM Benchmark', fmtM(d.hem_benchmark||0), 'Household Expenditure Measure'],
      ['Amount Used in Assessment', fmtM(Math.max(totalExpM, Number(d.hem_benchmark||0))), 'Higher of declared vs HEM (CCCFA)'],
    ],
    headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
    bodyStyles:{fontSize:8.5,textColor:slate7},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles:{1:{halign:'right',fontStyle:'bold'}},
    margin:{left:M,right:M}, tableWidth:usable,
  });
  ftr(totalPages);

  // Page 4: Recommendation
  pdf.addPage(); page++;
  hdr(); y=25;
  y = secHdr(y, '4. Our Recommendation');
  const ai = d.advice_summary_ai || {};
  const recL = ai.lender_recommendation || d.recommended_lender || '—';

  // Recommendation highlight
  pdf.setFillColor(...bl); pdf.setDrawColor(...brand);
  pdf.roundedRect(M,y,usable,32,3,3,'FD');
  pdf.setFillColor(...brand); pdf.rect(M,y,3,32,'F');
  pdf.setTextColor(...slate5); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
  pdf.text('RECOMMENDED LENDER', M+8, y+7);
  pdf.setTextColor(...slate9); pdf.setFont('helvetica','bold'); pdf.setFontSize(20);
  pdf.text(recL, M+8, y+19);
  if(ai.confidence) {
    pdf.setFillColor(...brand); pdf.roundedRect(W-M-38,y+5,35,8,2,2,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(8);
    pdf.text(`Confidence: ${ai.confidence.toUpperCase()}`, W-M-36, y+11);
  }
  if(d.recommended_rate) {
    pdf.setTextColor(...slate5); pdf.setFont('helvetica','normal'); pdf.setFontSize(10);
    pdf.text(`Indicative rate: ${d.recommended_rate}%`, M+8, y+27);
  }
  y+=37;

  const sections = [
    ['Rationale', ai.why_this_lender],
    ['Alternatives Considered', ai.why_not_others],
    ['How This Meets Your Needs', ai.how_meets_client_needs],
    ['Policy and Eligibility Notes', ai.policy_fit_notes],
  ];
  for(const [lbl, txt] of sections) {
    if(!txt) continue;
    pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(...slate7);
    pdf.text(lbl, M, y); y+=5;
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(txt, usable);
    pdf.text(lines, M, y); y += lines.length*5+5;
    if(y>H-30){ftr(totalPages);pdf.addPage();page++;hdr();y=25;}
  }

  if(ai.conditions_likely?.length) {
    autoTable(pdf, {
      startY:y,
      head:[['#','Conditions Likely to be Required by Lender']],
      body: ai.conditions_likely.map((c:string,i:number)=>[String(i+1),c]),
      headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
      bodyStyles:{fontSize:8.5,textColor:slate7},
      alternateRowStyles:{fillColor:[248,250,252]},
      columnStyles:{0:{cellWidth:10}},
      margin:{left:M,right:M}, tableWidth:usable,
    });
    y=(pdf as any).lastAutoTable.finalY+5;
  }
  if(ai.risks_to_disclose?.length) {
    autoTable(pdf, {
      startY:y,
      head:[['Key Risks — Adviser Must Disclose to Client']],
      body: ai.risks_to_disclose.map((r:string)=>[`• ${r}`]),
      headStyles:{fillColor:red,textColor:255,fontSize:8,fontStyle:'bold'},
      bodyStyles:{fontSize:8.5,textColor:slate7},
      alternateRowStyles:{fillColor:redBg},
      margin:{left:M,right:M}, tableWidth:usable,
    });
  }
  ftr(totalPages);

  // Page 5: Compliance + Signatures
  pdf.addPage(); page++;
  hdr(); y=25;
  y = secHdr(y, '5. Regulatory Compliance');
  const comp = d.compliance||{};
  autoTable(pdf, {
    startY:y,
    head:[['','Compliance Item','Status','Regulatory Basis']],
    body:[
      [comp.disclosure_statement_provided?'✓':'○','Disclosure Statement Provided',comp.disclosure_statement_provided?'Complete':'Pending','FMC Act 2013, s.431K'],
      [comp.disclosure_signed?'✓':'○','Disclosure Signed by Client',comp.disclosure_signed?'Complete':'Pending','FMC Act 2013, s.431K'],
      [comp.needs_objectives_completed?'✓':'○','Needs & Objectives Documented',comp.needs_objectives_completed?'Complete':'Pending','FAA 2008'],
      [comp.kyc_identity_verified?'✓':'○','KYC Identity Verified',comp.kyc_identity_verified?'Complete':'Pending','AML/CFT Act 2009'],
      [comp.kyc_address_verified?'✓':'○','Address Verified',comp.kyc_address_verified?'Complete':'Pending','AML/CFT Act 2009'],
      [comp.kyc_aml_checked?'✓':'○','AML/PEP Check',comp.kyc_aml_checked?'Complete':'Pending','AML/CFT Act 2009'],
      [comp.cccfa_income_verified?'✓':'○','Income Verified',comp.cccfa_income_verified?'Complete':'Pending','CCCFA 2003'],
      [comp.cccfa_expenses_verified?'✓':'○','Expenses Verified',comp.cccfa_expenses_verified?'Complete':'Pending','CCCFA 2003'],
      [comp.cccfa_affordability_assessed?'✓':'○','Affordability Assessed',comp.cccfa_affordability_assessed?'Complete':'Pending','CCCFA 2003'],
      [comp.cccfa_credit_checked?'✓':'○','Credit Check Completed',comp.cccfa_credit_checked?'Complete':'Pending','CCCFA 2003'],
      [comp.client_authority_obtained?'✓':'○','Client Authority Obtained',comp.client_authority_obtained?'Complete':'Pending','FMC Act 2013'],
    ],
    headStyles:{fillColor:slate9,textColor:255,fontSize:8,fontStyle:'bold'},
    bodyStyles:{fontSize:8.5,textColor:slate7},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles:{0:{cellWidth:8,halign:'center',fontStyle:'bold'},2:{cellWidth:22,fontStyle:'bold'},3:{cellWidth:48,textColor:slate5,fontSize:7.5}},
    didParseCell:(h:any)=>{
      if(h.section==='body'){
        if(h.column.index===0) h.cell.styles.textColor=h.cell.raw==='✓'?green:[156,163,175];
        if(h.column.index===2) h.cell.styles.textColor=h.cell.raw==='Complete'?green:amber;
      }
    },
    margin:{left:M,right:M}, tableWidth:usable,
  });
  y=(pdf as any).lastAutoTable.finalY+8;

  if(ai.adviser_notes) {
    pdf.setFillColor(255,251,235); pdf.setDrawColor(253,230,138);
    pdf.roundedRect(M,y,usable,18,2,2,'FD');
    pdf.setTextColor(146,64,14); pdf.setFont('helvetica','bold'); pdf.setFontSize(8);
    pdf.text('ADVISER NOTES', M+5, y+6);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(ai.adviser_notes, usable-10).slice(0,2), M+5, y+12);
    y+=22;
  }

  // Acknowledgement
  y = secHdr(y, '6. Acknowledgement and Signatures');
  pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); pdf.setTextColor(...slate7);
  const ack='By signing below, the client confirms they have read and understood this Statement of Advice and that information provided is accurate and complete. The adviser confirms this advice was prepared in accordance with the Financial Markets Conduct Act 2013 and Financial Advisers Act 2008.';
  pdf.text(pdf.splitTextToSize(ack, usable), M, y); y+=16;

  pdf.setDrawColor(...slate5 as [number,number,number]); pdf.setLineWidth(0.5);
  const sigW=(usable-15)/2;
  [[d.client_name||'Client','Client'],[d.advisor_name||'Adviser','Licensed Financial Adviser']].forEach(([nm,role],i)=>{
    const sx=M+i*(sigW+15);
    pdf.line(sx,y+10,sx+sigW,y+10);
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); pdf.setTextColor(...slate7);
    pdf.text(nm,sx,y+17);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(...slate5);
    pdf.text(role,sx,y+22);
    pdf.line(sx,y+32,sx+sigW,y+32);
    pdf.text('Date',sx,y+38);
  });
  y+=44;

  pdf.setDrawColor(203,213,225); pdf.line(M,y,W-M,y); y+=4;
  pdf.setFont('helvetica','italic'); pdf.setFontSize(7.5); pdf.setTextColor(...slate5);
  const leg=`${d.firm_name||''} is a licensed Financial Advice Provider under the FMC Act 2013. FSP: ${d.fap_licence_number||'—'}. Complaints: ${d.disputes_scheme||'FSCL'} — ${d.complaints_url||''}. This document was AI-assisted and reviewed by ${d.advisor_name||'a licensed adviser'}.`;
  pdf.text(pdf.splitTextToSize(leg, usable), M, y);
  ftr(totalPages);

  return pdf;
}

// ── MAIN HOOK ────────────────────────────────────────────────────
export function usePdfGenerator(): UsePdfResult {
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (applicationId: string, docType: PdfDocType, forceRegen = false) => {
    setGenerating(true);
    setError(null);
    try {
      // 1. Get full data from DB
      const { data, error: dbErr } = await supabase.rpc('get_pdf_data', { p_application_id: applicationId });
      if(dbErr) throw dbErr;
      if(!data) throw new Error('No application data found');
      const d = data as Record<string,any>;
      const currentHash = hashData(d);

      // 2. Check cache
      if(!forceRegen) {
        const { data: cached } = await supabase
          .from('generated_documents')
          .select('id, pdf_base64, data_hash, created_at, status')
          .eq('application_id', applicationId)
          .eq('doc_type', docType)
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if(cached?.pdf_base64 && cached.data_hash === currentHash) {
          // Use cached PDF
          const bytes = atob(cached.pdf_base64);
          const arr = new Uint8Array(bytes.length);
          for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
          const blob = new Blob([arr], { type: 'application/pdf' });
          setPreview({
            docId: cached.id,
            docType,
            title: docType === 'soa_full' ? 'Statement of Advice' : docType === 'disclosure_statement' ? 'Disclosure Statement' : 'Needs and Objectives',
            applicationId,
            pdfDataUrl: URL.createObjectURL(blob),
            pdfBlob: blob,
            data: d,
            cached: true,
            generatedAt: cached.created_at,
          });
          setGenerating(false);
          return;
        }
      }

      // 3. Generate PDF
      const pdf = buildPdf(d, docType);
      const pdfBlob = pdf.output('blob');
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const blobUrl = URL.createObjectURL(pdfBlob);

      // 4. Get firm_id for insert
      const { data: appData } = await supabase
        .from('applications').select('firm_id, assigned_to, client_id').eq('id', applicationId).single();

      // 5. Archive old versions
      await supabase.from('generated_documents')
        .update({ status: 'archived' })
        .eq('application_id', applicationId)
        .eq('doc_type', docType);

      // 6. Save to generated_documents with base64
      const docTitles: Record<PdfDocType,string> = {
        soa_full: 'Statement of Advice',
        disclosure_statement: 'Financial Adviser Disclosure Statement',
        needs_objectives: 'Needs and Objectives Statement',
      };
      const { data: saved } = await supabase.from('generated_documents').insert({
        application_id: applicationId,
        firm_id: appData?.firm_id,
        advisor_id: appData?.assigned_to,
        client_id: appData?.client_id,
        doc_type: docType,
        doc_title: docTitles[docType],
        data_hash: currentHash,
        pdf_base64: pdfBase64,
        status: 'draft',
        ai_drafted_content: d.advice_summary_ai || {},
      }).select('id').single();

      setPreview({
        docId: saved?.id || null,
        docType,
        title: docTitles[docType],
        applicationId,
        pdfDataUrl: blobUrl,
        pdfBlob,
        data: d,
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    } catch(e: any) {
      setError(e.message || 'PDF generation failed');
    } finally {
      setGenerating(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    if(preview?.pdfDataUrl) URL.revokeObjectURL(preview.pdfDataUrl);
    setPreview(null);
  }, [preview]);

  const approve = useCallback(async (docId: string) => {
    await supabase.from('generated_documents').update({
      status: 'approved',
      advisor_reviewed: true,
      advisor_reviewed_at: new Date().toISOString(),
    }).eq('id', docId);
  }, []);

  const download = useCallback(() => {
    if(!preview) return;
    const a = document.createElement('a');
    a.href = preview.pdfDataUrl;
    a.download = `${preview.title.replace(/\s+/g,'_')}_${preview.data.client_name?.replace(/\s+/g,'_') || 'Client'}_${new Date().toLocaleDateString('en-NZ').replace(/\//g,'-')}.pdf`;
    a.click();
  }, [preview]);

  return { generating, preview, error, generate, closePreview, approve, download };
}
