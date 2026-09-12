from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(TTFont('SimHei', 'C:/Windows/Fonts/simhei.ttf'))

c = canvas.Canvas('G:/hse-dashboard/_test_policy_chinese.pdf', pagesize=A4)
c.setFont('SimHei', 14)
c.drawString(100, 750, '保险单号：PZ20240815001')
c.drawString(100, 720, '保险期间自 2024年08月15日 至 2025年08月14日')
c.drawString(100, 690, '保险人：中国平安财产保险股份有限公司')
c.drawString(100, 660, '投保标的：宁津项目厂区公众责任险')
c.showPage()
c.save()
print('Created _test_policy_chinese.pdf')
