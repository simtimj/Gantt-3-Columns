// Index.html split (2026-11-21, speed item G): the page is a shell that pulls in Index_*.html parts with
// <?!= HtmlService.createHtmlOutputFromFile('Index_X').getContent() ?>. Tools read the whole page through this,
// so they see exactly what Apps Script serves. WeekdayIcons / Drafts are left for each tool to swap in.
import fs from 'fs';

export const INDEX_PARTS = ['Index_Css', 'Index_LateCss', 'Index_Main', 'Index_Cards', 'Index_Extras', 'Index_Calendar', 'Index_Layout'];

export function readIndexHtml() {
  return fs.readFileSync('Index.html', 'utf8').replace(
    /<\?!= HtmlService\.createHtmlOutputFromFile\('(Index_\w+)'\)\.getContent\(\) \?>/g,
    (_, n) => fs.readFileSync(n + '.html', 'utf8'));
}
