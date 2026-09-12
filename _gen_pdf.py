from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

c = canvas.Canvas("G:/hse-dashboard/_test_policy.pdf", pagesize=A4)
c.drawString(80, 760, "Property All Risks Insurance Policy")
c.drawString(80, 730, "Policy No: TEST-POLICY-2026-001")
c.drawString(80, 700, "Insurance Period: 2025-05-01 to 2026-04-30")
c.drawString(80, 670, "Insurer: Test Insurance Company Ltd")
c.showPage()
c.save()
print("PDF generated")
