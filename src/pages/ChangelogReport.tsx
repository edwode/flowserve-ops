import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

const ChangelogReport = () => {
  const navigate = useNavigate();

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const lineHeight = 6;
    let y = 20;

    const addText = (text: string, fontSize: number = 10, bold: boolean = false) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
      lines.forEach((line: string) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      });
    };

    const addSection = (title: string) => {
      y += 4;
      addText(title, 14, true);
      y += 2;
    };

    const addSubSection = (title: string) => {
      y += 2;
      addText(title, 12, true);
    };

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("EventOpsX", margin, 18);
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Application Update Report", margin, 28);
    doc.setFontSize(10);
    doc.text("December 4-7, 2025", margin, 36);
    
    doc.setTextColor(0, 0, 0);
    y = 50;

    // Executive Summary
    addSection("Executive Summary");
    addText("This report documents the feature enhancements and improvements implemented in the EventOpsX event operations management system during the period of December 4-7, 2025. The updates focus on currency localization, enhanced payment workflows, and operational efficiency improvements.");

    // Currency Localization System
    addSection("1. Currency Localization System");
    
    addSubSection("1.1 Tenant Currency Configuration");
    addText("Status: Completed ✓");
    addText("A comprehensive currency localization system was implemented allowing each tenant to configure their preferred currency for all monetary displays.");
    y += 2;
    addText("Changes Made:");
    addText("• Added RLS policy to allow tenant admins to update tenant settings including currency");
    addText("• Currency selection is now available in the Admin Settings page");
    addText("• Supports real-time currency updates across the application");

    addSubSection("1.2 Dynamic Currency Formatting Hook");
    addText("Status: Completed ✓");
    addText("New File: src/hooks/useTenantCurrency.ts");
    y += 2;
    addText("Features:");
    addText("• Fetches tenant currency configuration from the database");
    addText("• Provides formatPrice() function for consistent currency formatting");
    addText("• Subscribes to real-time updates for immediate currency changes");
    addText("• Uses browser's Intl.NumberFormat API for locale-aware formatting");

    addSubSection("1.3 Application-Wide Currency Integration");
    addText("Status: Completed ✓");
    y += 2;
    addText("Currency formatting integrated across all pages:");
    addText("• Waiter Dashboard - Order totals, item prices");
    addText("• Cashier Station - Payment amounts, refunds");
    addText("• Order Details - Line items, totals");
    addText("• Station Display - Item prices");
    addText("• Bar Interface - Order totals, item prices");
    addText("• New Order - Cart items, running total");
    addText("• Split Payment Dialog - Split amounts, balances");

    // Thermal Receipt Printing
    addSection("2. Thermal Receipt Printing");
    
    addSubSection("2.1 Receipt Printing Feature");
    addText("Status: Completed ✓");
    addText("Location: Cashier Station → Order Details Popup");
    y += 2;
    addText("Features:");
    addText("• Print icon button in Order Details dialog header");
    addText("• Optimized for 80mm thermal receipt paper");
    addText("• Monospace font for proper alignment");
    addText("• Dashed separator lines for visual clarity");
    y += 2;
    addText("Receipt Content:");
    addText("• Order number and header");
    addText("• Table number and guest name");
    addText("• Waiter information");
    addText("• Date and time");
    addText("• Itemized list with quantities and prices");
    addText("• Bold total amount");
    addText("• Thank you footer message");

    // Files Modified
    addSection("3. Summary of Files Modified");
    
    addSubSection("New Files Created");
    addText("• src/hooks/useTenantCurrency.ts - Currency formatting hook");
    addText("• CHANGELOG_Dec2025.md - Report document");
    
    addSubSection("Modified Files");
    addText("• src/pages/admin/Menu.tsx - Currency formatting for menu item prices");
    addText("• src/pages/Waiter.tsx - Currency formatting for order totals");
    addText("• src/pages/Cashier.tsx - Currency formatting + thermal receipt printing");
    addText("• src/pages/OrderDetails.tsx - Currency formatting for line items");
    addText("• src/pages/Station.tsx - Currency formatting for displayed prices");
    addText("• src/pages/Bar.tsx - Currency formatting for bar orders");
    addText("• src/pages/NewOrder.tsx - Currency formatting for cart and totals");
    addText("• src/components/SplitPaymentDialog.tsx - Currency formatting for split payments");

    // Testing Recommendations
    addSection("4. Testing Recommendations");
    
    addSubSection("Currency System");
    addText("• Verify currency changes in Admin Settings persist correctly");
    addText("• Confirm all pages display the correct currency symbol");
    addText("• Test currency formatting with different locales (USD, EUR, GBP, etc.)");
    addText("• Verify real-time updates when currency is changed");
    
    addSubSection("Receipt Printing");
    addText("• Test printing on 80mm thermal printer");
    addText("• Verify receipt alignment and formatting");
    addText("• Confirm all order items appear correctly");
    addText("• Test with orders containing special characters");

    // Known Limitations
    addSection("5. Known Limitations");
    addText("1. Currency Formatting: Uses browser's Intl.NumberFormat which may vary between browsers");
    addText("2. Receipt Printing: Requires pop-up windows to be allowed");
    addText("3. Thermal Printer: Optimized for 80mm printers; 58mm may need adjustment");

    // Future Enhancements
    addSection("6. Future Enhancements (Suggested)");
    addText("1. Receipt Branding - Add tenant logo and custom header/footer text");
    addText("2. Digital Receipts - Email or SMS receipt option");
    addText("3. Multiple Currency Display - Show prices in multiple currencies");
    addText("4. Receipt Templates - Customizable receipt layouts per tenant");
    addText("5. Print Queue Management - Integration with network print servers");

    // Footer
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Report Prepared By: Lovable AI Assistant", margin, y);
    y += 5;
    doc.text("For: EventOpsX Development Team", margin, y);
    y += 5;
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, y);

    // Save PDF
    doc.save("EventOpsX_Update_Report_Dec2025.pdf");
    toast.success("PDF report downloaded successfully");
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Changelog Report</h1>
        </div>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>EventOpsX Update Report</CardTitle>
                <p className="text-sm text-muted-foreground">December 4-7, 2025</p>
              </div>
            </div>
            <Button onClick={generatePDF} className="gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-2">Executive Summary</h2>
              <p className="text-muted-foreground">
                This report documents the feature enhancements and improvements implemented in the EventOpsX 
                event operations management system during the period of December 4-7, 2025. The updates focus 
                on currency localization, enhanced payment workflows, and operational efficiency improvements.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">1. Currency Localization System</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Tenant currency configuration with RLS policies</li>
                <li>Dynamic currency formatting hook (useTenantCurrency)</li>
                <li>Application-wide integration across all price-displaying pages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">2. Thermal Receipt Printing</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Print functionality for Cashier Station</li>
                <li>Optimized for 80mm thermal receipt paper</li>
                <li>Professional receipt layout with order details</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2">3. Files Modified</h2>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">New Files:</p>
                  <ul className="list-disc list-inside">
                    <li>useTenantCurrency.ts</li>
                    <li>CHANGELOG_Dec2025.md</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground">Modified Files:</p>
                  <ul className="list-disc list-inside">
                    <li>8 pages updated</li>
                    <li>1 component updated</li>
                  </ul>
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChangelogReport;
