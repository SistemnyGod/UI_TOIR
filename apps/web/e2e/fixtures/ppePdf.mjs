import { installPpeKitFixture } from './ppeKit.mjs';
// A valid single-page PDF for browser-state checks, not a server form/layout fixture.
function samplePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 18 Tf 40 780 Td (Local UI PDF fixture) Tj ET'; objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
  let pdf = '%PDF-1.4\n'; const offsets = [0]; for (const [index,object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += (index+1)+' 0 obj\n'+object+'\nendobj\n'; }
  const start = Buffer.byteLength(pdf); pdf += 'xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF'; return pdf;
}
export async function installPpePdfFixture(page, options={}) {
  const fixture = await installPpeKitFixture(page, {positions:54, documentStatus:options.documentStatus}); const printRequests=[]; let attempts=0, release, failNext=false;
  let gate=options.delay ? new Promise(resolve=>{release=resolve}) : Promise.resolve();
  await page.route('**/api/v1/inventory/ppe/issue-documents/*/print?**',async route=>{
    const request=route.request();printRequests.push(request.url());await gate;
    if(++attempts===1&&options.failOnce||failNext){failNext=false;return route.fulfill({status:503,contentType:'application/problem+json',json:{title:'PDF service unavailable',errors:{print:['Сервис печати временно недоступен. Повторите подготовку файла.']}}});}
    const pdf=new URL(request.url()).searchParams.get('format')==='pdf';return route.fulfill({contentType:pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',headers:{'content-disposition':'attachment; filename="ppe-ui.'+(pdf?'pdf':'docx')+'"'},body:pdf?samplePdf():'local docx download fixture'});
  });
  return {...fixture,printRequests,failNextPrint:()=>{failNext=true},releasePrint:()=>{release?.();gate=Promise.resolve();}};
}
export async function openPpeReview(page,origin='') {
  await page.goto(origin+'/#inventory-ppe-create');await page.getByRole('heading',{name:'Проверка данных',exact:true}).waitFor();await page.getByRole('button',{name:'Далее',exact:true}).click();await page.getByRole('button',{name:'Предпросмотр документов',exact:true}).click();await page.getByRole('heading',{name:'Предпросмотр и печать',exact:true}).waitFor();
}
