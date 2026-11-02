"""Real HTTP conversion check using synthetic Korean text, tables and a scanned page."""
import io
import json
import os
import re
import urllib.request
from pathlib import Path
import pypdfium2 as pdfium
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

pdfmetrics.registerFont(TTFont('Korean', '/usr/share/fonts/truetype/nanum/NanumGothic.ttf'))

def draw(c):
    c.setFont('Korean', 24)
    c.drawString(60, 760, '지원사업 안내 TEST 2026')
    c.setFont('Korean', 17)
    c.drawString(60, 710, '신청기간: 2026년 11월 1일')
    for y, label, value in [(650, '항목', '지원금'), (600, '교육비', '300000'), (550, '식비', '100000')]:
        c.rect(55, y - 15, 420, 50)
        c.line(250, y - 15, 250, y + 35)
        c.drawString(65, y, label)
        c.drawString(270, y, value)

text=io.BytesIO();c=canvas.Canvas(text);draw(c);c.save()
rendered=pdfium.PdfDocument(text.getvalue())[0].render(scale=2).to_pil()
combined=io.BytesIO();c=canvas.Canvas(combined);draw(c);c.showPage()
c.drawImage(ImageReader(rendered),0,0,width=595,height=842);c.save()
payload=combined.getvalue()
boundary='review-pdf-fixture'
body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic-review.pdf"\r\nContent-Type: application/pdf\r\n\r\n').encode()+payload+f'\r\n--{boundary}--\r\n'.encode()
request=urllib.request.Request('http://127.0.0.1:8080/v1/convert',data=body,
 headers={'Content-Type':f'multipart/form-data; boundary={boundary}', 'X-Docling-Token':os.environ['DOCLING_SHARED_SECRET']})
with urllib.request.urlopen(request,timeout=600) as response:result=json.load(response)
assert result['page_count']==2,result
assert [p['page_number'] for p in result['pages']]==[1,2]
for page in result['pages']:
    normalized=re.sub(r'\s+','',page['markdown'])
    for expected in ['지원사업','교육비','300000','100000']:
        assert expected in normalized,(page['page_number'],expected,page['markdown'])
report={'real_conversion':True,'pages':2,'text_table_checked':True,'scanned_korean_ocr_checked':True,'duration_ms':result['duration_ms']}
Path('docling-smoke.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
