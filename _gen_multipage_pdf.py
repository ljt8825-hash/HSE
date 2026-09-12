from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(TTFont('SimHei', 'C:/Windows/Fonts/simhei.ttf'))

c = canvas.Canvas('G:/hse-dashboard/_test_policy_6pages.pdf', pagesize=A4)
c.setFont('SimHei', 14)
for i in range(1, 7):
    c.drawString(100, 750, f'第 {i} 页内容')
    if i == 1:
        c.drawString(100, 720, '保险单号：MP20240815001')
        c.drawString(100, 690, '保险期间自 2024年09月01日 至 2025年08月31日')
        c.drawString(100, 660, '保险人：中国人民财产保险股份有限公司')
    c.showPage()
c.save()
print('Created _test_policy_6pages.pdf')
