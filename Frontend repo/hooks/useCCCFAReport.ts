import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';

// ── Types ────────────────────────────────────────────────────────

export interface CCCFAReportData {
  id: string;
  application_id: string;
  firm_id: string;

  // Firm / branding (flattened from firms join)
  firm_name: string;
  brand_color: string;
  fap_licence_number: string;
  disclaimer_text: string;
  complaints_body: string;
  complaints_url: string;

  // Client (flattened from clients join)
  client_name: string;
  client_email: string;

  // Adviser
  adviser_name: string;
  adviser_fsp: string;

  // Application (flattened from applications join)
  reference_number: string;
  loan_purpose: string;
  application_type: string;
  loan_amount: number;
  new_loan_amount: number;
  property_value: number;
  property_address: string;
  property_city: string;
  lvr_percent: number;

  // Income
  income_records: {
    income_type: string;
    annual_gross_total: number;
    verified: boolean;
    parsed_bank_name: string | null;
  }[];
  gross_annual_income: number;
  net_monthly_income: number;

  // Expenses
  declared_expenses_monthly: number;
  hem_benchmark_monthly: number;
  hem_applied: boolean;
  expenses_used_monthly: number;
  total_existing_debt_monthly: number;

  // Serviceability
  stress_test_rate: number;
  stress_repayment_monthly: number;
  umi_monthly: number;
  dti_ratio: number;
  passes_serviceability: boolean;

  // Lender matrix
  lender_matrix: Record<string, boolean>;

  // Risk flags
  has_anomalies: boolean;
  flag_high_dti: boolean;
  flag_high_lvr: boolean;
  flag_low_umi: boolean;
  anomaly_flags: { title: string; description: string; severity: string }[];

  created_at: string;
}

interface UseCCCFAReportResult {
  reportData: CCCFAReportData | null;
  generating: boolean;
  pdfUrl: string | null;
  loadReportData: () => Promise<void>;
  generatePDF: () => Promise<Blob>;
  savePDF: (pdfBlob: Blob, declaration: string) => Promise<string>;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useCCCFAReport(applicationId: string): UseCCCFAReportResult {
  const [reportData, setReportData] = useState<CCCFAReportData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const loadReportData = useCallback(async () => {
    const { data } = await supabase
      .from('serviceability_assessments')
      .select(`
        *, 
        applications!inner(
          reference_number, loan_amount, property_value, property_address,
          loan_purpose, application_type, lender_name,
          clients!inner(first_name, last_name, email, phone, date_of_birth),
          firms!inner(name, fsp_number, fap_licence_number, brand_color, 
                      logo_url, address, city, complaints_body, disclaimer_text)
        )
      `)
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const app = data.applications as any;
    const client = app?.clients;
    const firm = app?.firms;

    const flat: CCCFAReportData = {
      ...data,
      firm_id: data.firm_id,
      firm_name: firm?.name ?? '',
      brand_color: firm?.brand_color ?? '#6366F1',
      fap_licence_number: firm?.fap_licence_number ?? '',
      disclaimer_text: firm?.disclaimer_text ?? '',
      complaints_body: firm?.complaints_body ?? 'FSCL',
      complaints_url: firm?.complaints_url ?? '',
      client_name: client ? `${client.first_name} ${client.last_name}` : '',
      client_email: client?.email ?? '',
      adviser_name: data.adviser_name ?? '',
      adviser_fsp: data.adviser_fsp ?? firm?.fsp_number ?? '',
      reference_number: app?.reference_number ?? '',
      loan_purpose: app?.loan_purpose ?? '',
      application_type: app?.application_type ?? '',
      loan_amount: app?.loan_amount ?? data.loan_amount ?? 0,
      new_loan_amount: data.new_loan_amount ?? app?.loan_amount ?? 0,
      property_value: app?.property_value ?? data.property_value ?? 0,
      property_address: app?.property_address ?? '',
      property_city: firm?.city ?? '',
      lvr_percent: data.lvr_percent ?? 0,
      income_records: data.income_records ?? data.income_items ?? [],
      gross_annual_income: data.gross_annual_income ?? data.total_income ?? 0,
      net_monthly_income: data.net_monthly_income ?? 0,
      declared_expenses_monthly: data.declared_expenses_monthly ?? data.total_expenses ?? 0,
      hem_benchmark_monthly: data.hem_benchmark_monthly ?? data.hem_benchmark ?? 0,
      hem_applied: data.hem_applied ?? false,
      expenses_used_monthly: data.expenses_used_monthly ?? data.expenses_used ?? 0,
      total_existing_debt_monthly: data.total_existing_debt_monthly ?? 0,
      stress_test_rate: data.stress_test_rate ?? data.stress_rate ?? 8.5,
      stress_repayment_monthly: data.stress_repayment_monthly ?? data.stressed_repayment ?? 0,
      umi_monthly: data.umi_monthly ?? 0,
      dti_ratio: data.dti_ratio ?? 0,
      passes_serviceability: data.passes_serviceability ?? false,
      lender_matrix: data.lender_matrix ?? {},
      has_anomalies: data.has_anomalies ?? false,
      flag_high_dti: data.flag_high_dti ?? false,
      flag_high_lvr: data.flag_high_lvr ?? false,
      flag_low_umi: data.flag_low_umi ?? false,
      anomaly_flags: data.anomaly_flags ?? [],
      created_at: data.created_at,
    } as CCCFAReportData;

    setReportData(flat);
  }, [applicationId]);

  // ── PDF Generation (2-page CCCFA Affordability Report) ─────────

  const generatePDF = useCallback(async (): Promise<Blob> => {
    setGenerating(true);
    try {
      if (!reportData) await loadReportData();
      const data = reportData!;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const brandColor = data.brand_color || '#6366F1';
      const hexToRgb = (hex: string): [number, number, number] => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const [r, g, b] = hexToRgb(brandColor);
      const W = 210, M = 15;

      // ── PAGE 1 ──────────────────────────────────────────────────

      // Header bar
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, W, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(data.firm_name || 'AdvisorFlow', M, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('CCCFA Affordability Assessment Report', M, 19);

      // Report title area
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Affordability Assessment', M, 42);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Reference: ${data.reference_number}  ·  Date: ${new Date().toLocaleDateString('en-NZ')}`, M, 49);

      doc.setDrawColor(r, g, b);
      doc.setLineWidth(0.5);
      doc.line(M, 53, W - M, 53);

      // ── Helpers ─────────────────────────────────────────────────

      const sectionHeader = (title: string, yPos: number): number => {
        doc.setFillColor(240, 242, 255);
        doc.rect(M, yPos - 4, W - M * 2, 7, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(r, g, b);
        doc.text(title.toUpperCase(), M + 2, yPos + 0.5);
        doc.setTextColor(30, 30, 30);
        return yPos + 8;
      };

      const field = (label: string, value: any, xPos: number, yPos: number) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(label, xPos, yPos);
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'bold');
        doc.text(String(value || '—'), xPos, yPos + 4.5);
      };

      // ── SECTION 1: Parties ──────────────────────────────────────

      let y = 60;
      y = sectionHeader('1. Client & Adviser Details', y);
      field('Client Name', data.client_name, M, y);
      field('Email', data.client_email, M + 90, y);
      y += 12;
      field('Adviser', data.adviser_name, M, y);
      field('Adviser FSP', data.adviser_fsp, M + 90, y);
      y += 12;
      field('FAP Licence', data.fap_licence_number, M, y);
      field('Report Date', new Date().toLocaleDateString('en-NZ'), M + 90, y);
      y += 16;

      // ── SECTION 2: Loan Details ─────────────────────────────────

      y = sectionHeader('2. Loan Details', y);
      field('Loan Purpose', data.loan_purpose, M, y);
      field('Application Type', data.application_type, M + 90, y);
      y += 12;
      field('Loan Amount', `$${Number(data.loan_amount || data.new_loan_amount).toLocaleString('en-NZ')}`, M, y);
      field('Property Value', `$${Number(data.property_value).toLocaleString('en-NZ')}`, M + 90, y);
      y += 12;
      field('Property Address', data.property_address || data.property_city, M, y);
      field('LVR', `${Number(data.lvr_percent).toFixed(1)}%`, M + 90, y);
      y += 16;

      // ── SECTION 3: Income Assessment ────────────────────────────

      y = sectionHeader('3. Income Assessment (CCCFA s9)', y);

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Income Type', 'Annual Gross', 'Verified', 'Method']],
        body: (data.income_records || []).map((i) => [
          i.income_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || '—',
          `$${Number(i.annual_gross_total || 0).toLocaleString('en-NZ')}`,
          i.verified ? '✓ Yes' : '○ Declared',
          i.parsed_bank_name ? `Bank: ${i.parsed_bank_name}` : 'Self-declared',
        ]),
        foot: [['Total Gross Annual Income',
          `$${Number(data.gross_annual_income || 0).toLocaleString('en-NZ')}`, '', '']],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240, 242, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 255] },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // ── SECTION 4: Expense Assessment ───────────────────────────

      y = sectionHeader('4. Expense Assessment — HEM Comparison', y);

      const hemApplied = data.hem_applied;
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Expense Category', 'Declared (monthly)', 'HEM Benchmark', 'Used in Assessment']],
        body: [
          ['Total Household Expenses',
            `$${Number(data.declared_expenses_monthly || 0).toLocaleString('en-NZ')}`,
            `$${Number(data.hem_benchmark_monthly || 0).toLocaleString('en-NZ')}`,
            hemApplied
              ? `$${Number(data.hem_benchmark_monthly).toLocaleString('en-NZ')} (HEM applied)`
              : `$${Number(data.declared_expenses_monthly).toLocaleString('en-NZ')} (declared)`,
          ],
          ['Existing Debt Commitments',
            `$${Number(data.total_existing_debt_monthly || 0).toLocaleString('en-NZ')}`,
            '—', `$${Number(data.total_existing_debt_monthly || 0).toLocaleString('en-NZ')}`,
          ],
        ],
        foot: [['Total Monthly Commitments', '', '',
          `$${Number((data.expenses_used_monthly || 0) + (data.total_existing_debt_monthly || 0)).toLocaleString('en-NZ')}`,
        ]],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240, 242, 255], fontStyle: 'bold' },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      if (hemApplied) {
        doc.setFontSize(7.5);
        doc.setTextColor(180, 100, 0);
        doc.setFont('helvetica', 'italic');
        doc.text('Note: Declared expenses were below the HEM benchmark. As required under CCCFA, the HEM has been applied.', M, y);
        y += 7;
      }

      // ── PAGE 2 ──────────────────────────────────────────────────

      doc.addPage();

      // Continuation header
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, W, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.firm_name}  ·  CCCFA Affordability Assessment  ·  ${data.reference_number}`, M, 9);
      doc.setTextColor(30, 30, 30);
      y = 22;

      // ── SECTION 5: Stress Test ──────────────────────────────────

      y = sectionHeader('5. Serviceability Stress Test (8.5% pa)', y);

      const passes = data.passes_serviceability;
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Assessment Metric', 'Amount', 'Result']],
        body: [
          ['Net Monthly Income', `$${Number(data.net_monthly_income || 0).toLocaleString('en-NZ')}`, ''],
          ['Stress Test Rate', `${data.stress_test_rate || 8.5}% p.a.`, ''],
          ['Proposed Repayment (stress rate)', `$${Number(data.stress_repayment_monthly || 0).toLocaleString('en-NZ')}/mth`, ''],
          ['Total Monthly Commitments', `$${Number((data.expenses_used_monthly || 0) + (data.total_existing_debt_monthly || 0) + (data.stress_repayment_monthly || 0)).toLocaleString('en-NZ')}/mth`, ''],
          ['Uncommitted Monthly Income (UMI)', `$${Number(data.umi_monthly || 0).toLocaleString('en-NZ')}/mth`,
            Number(data.umi_monthly) > 0 ? '✓ Positive' : '✗ Negative'],
          ['DTI Ratio', `${Number(data.dti_ratio || 0).toFixed(1)}x`,
            Number(data.dti_ratio) <= 6 ? '✓ Within limit (6x)' : '✗ Exceeds limit'],
          ['LVR', `${Number(data.lvr_percent || 0).toFixed(1)}%`,
            Number(data.lvr_percent) <= 80 ? '✓ Standard LVR' : '⚠ Low equity applies'],
        ],
        foot: [['AFFORDABILITY CONCLUSION', '',
          passes ? '✓ PASSES SERVICEABILITY' : '✗ FAILS SERVICEABILITY']],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
        footStyles: {
          fillColor: passes ? [220, 253, 231] : [254, 226, 226],
          textColor: passes ? [22, 101, 52] : [185, 28, 28],
          fontStyle: 'bold', fontSize: 9,
        },
        columnStyles: { 2: { fontStyle: 'bold' } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // ── SECTION 6: Lender Suitability ───────────────────────────

      y = sectionHeader('6. Lender Suitability Matrix', y);

      const lenders = data.lender_matrix || {};
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Lender', 'Serviceability']],
        body: Object.entries(lenders).map(([lender, lenderPasses]) => [
          lender,
          lenderPasses ? '✓ Passes' : '✗ Does not pass',
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { fontStyle: 'bold' } },
        didParseCell: (hook: any) => {
          if (hook.column.index === 1 && hook.section === 'body') {
            hook.cell.styles.textColor =
              String(hook.cell.raw).includes('✓') ? [22, 101, 52] : [185, 28, 28];
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // ── SECTION 7: Risk Flags ───────────────────────────────────

      if (data.has_anomalies || data.flag_high_dti || data.flag_high_lvr) {
        y = sectionHeader('7. Risk Flags & CCCFA Considerations', y);
        const flags: string[][] = [];
        if (data.flag_high_dti) flags.push(['High DTI', 'DTI exceeds recommended threshold. Additional scrutiny required.', 'High']);
        if (data.flag_high_lvr) flags.push(['High LVR', 'LVR above 80%. Low equity margin applies.', 'Medium']);
        if (data.flag_low_umi) flags.push(['Low UMI', 'Uncommitted monthly income is below recommended buffer.', 'High']);
        (data.anomaly_flags || []).forEach((f) =>
          flags.push([f.title, f.description || '', f.severity?.toUpperCase() || 'Medium']),
        );

        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Flag', 'Description', 'Severity']],
          body: flags,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: 'bold' },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── SECTION 8: Adviser Declaration ──────────────────────────

      y = sectionHeader('8. Adviser Declaration', y);

      const declaration = [
        'I confirm that I have:',
        '(a) Made reasonable inquiries to determine the applicant\'s financial situation, requirements and objectives;',
        '(b) Assessed the suitability and affordability of this loan in accordance with the Credit Contracts and Consumer Finance Act 2003;',
        '(c) Applied the Household Expenditure Measure (HEM) where declared expenses were below the benchmark;',
        '(d) Conducted a stress test at 8.5% p.a. to ensure the loan is affordable under adverse conditions;',
        '(e) Disclosed all material information required under the Financial Markets Conduct Act 2013.',
      ];

      declaration.forEach((line) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', line.startsWith('I confirm') ? 'bold' : 'normal');
        doc.setTextColor(30, 30, 30);
        const split = doc.splitTextToSize(line, W - M * 2);
        doc.text(split, M, y);
        y += split.length * 4.5;
      });

      y += 6;
      doc.setDrawColor(100, 100, 100);
      doc.line(M, y, M + 70, y);
      doc.line(M + 90, y, M + 160, y);
      y += 4;
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Adviser Signature', M, y);
      doc.text('Date', M + 90, y);
      y += 8;
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text(data.adviser_name || '—', M, y);
      doc.text(new Date().toLocaleDateString('en-NZ'), M + 90, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7);
      doc.text(`FSP: ${data.adviser_fsp || '—'}`, M, y);

      // ── Footer on all pages ─────────────────────────────────────

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${i} of ${totalPages}`, W - M - 20, 290);
        doc.text(
          data.disclaimer_text ||
          'This report is prepared in accordance with CCCFA 2003. This is not financial advice. ' +
          `Complaints: ${data.complaints_body || 'FSCL'} — ${data.complaints_url || 'fscl.org.nz'}`,
          M, 290, { maxWidth: W - M * 2 - 25 },
        );
      }

      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPdfUrl(blobUrl);
      return blob;
    } finally {
      setGenerating(false);
    }
  }, [reportData, loadReportData]);

  const savePDF = useCallback(async (pdfBlob: Blob, declaration: string): Promise<string> => {
    if (!reportData) throw new Error('Report data not loaded');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const path = `${reportData.firm_id}/${applicationId}/cccfa-report-${Date.now()}.pdf`;

    await supabase.storage.from('documents').upload(path, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

    const { data: { publicUrl } } = supabase.storage
      .from('documents').getPublicUrl(path);

    await supabase.rpc('save_cccfa_report', {
      p_application_id: applicationId,
      p_firm_id: reportData.firm_id,
      p_advisor_id: user.id,
      p_pdf_url: publicUrl,
      p_adviser_declaration: declaration,
    });

    setPdfUrl(publicUrl);
    return publicUrl;
  }, [applicationId, reportData]);

  return { reportData, generating, pdfUrl, loadReportData, generatePDF, savePDF };
}
