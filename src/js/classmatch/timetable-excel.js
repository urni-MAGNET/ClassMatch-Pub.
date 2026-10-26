import { timetableMinute, timetableTime, eventAppliesToCourt } from "./timetable-table.js";
const xml = value => String(value ?? "").replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);

// Excel 2003 XML is a native workbook format. Strings are explicitly typed (never formulas).
// Minute rows preserve absolute time; merged cells span each complete occupied match.
export function timetableWorkbookXML(pages, records, { title = "クラスマッチ", school = "" } = {}) {
  const cell = (index, value, { across = 0, down = 0, style = "cell", type = "String" } = {}) => `<Cell ss:Index="${index}" ss:StyleID="${style}"${across ? ` ss:MergeAcross="${across}"` : ""}${down ? ` ss:MergeDown="${down}"` : ""}><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
  const sheets = pages.map(page => {
    const lanes = [];
    const head1 = [], head2 = [], head3 = [];
    let index = 1;
    for (const column of page.columns) {
      head1.push(cell(index, column.sportName, { across: column.children.length * 2, style: "head" }));
      head2.push(cell(index, "時刻", { down: 1, style: "head" }));
      lanes.push({ index: index++, sportId: column.sportId, clock: true });
      for (const court of column.children) {
        head2.push(cell(index, court.label, { across: 1, style: "head" }));
        head3.push(cell(index, "チーム1", { style: "head" }), cell(index + 1, "チーム2", { style: "head" }));
        lanes.push({ index, sportId: column.sportId, court }); index += 2;
      }
    }
    const rows = [];
    const coveredUntil = new Map();
    for (let minute = page.startMinute; minute < page.endMinute; minute++) {
      const cells = [];
      for (const lane of lanes) {
        if ((coveredUntil.get(lane.index) ?? -1) > minute) continue;
        if (lane.clock) {
          const end = Math.min(page.endMinute, (Math.floor(minute / 10) + 1) * 10); cells.push(cell(lane.index, minute / 1440, { type: "Number", style: "time", down: end - minute - 1 })); coveredUntil.set(lane.index, end); continue;
        }
        const event = page.events.find(event => eventAppliesToCourt(event, lane.sportId, lane.court) && timetableMinute(event.startTime) === minute);
        const card = page.cards.find(card => card.sportId === lane.sportId && card.venue === lane.court.venue && card.court === lane.court.court && timetableMinute(card.occupiedStart) === minute);
        if (event || card) {
          const end = timetableMinute(event ? event.endTime : card.occupiedEnd);
          const down = end - minute - 1;
          if (event) cells.push(cell(lane.index, event.name, { across: 1, down, style: "event" }));
          else card.teamNames.forEach((name, offset) => cells.push(cell(lane.index + offset, name, { down })));
          coveredUntil.set(lane.index, end);
        } else cells.push(cell(lane.index, ""), cell(lane.index + 1, ""));
      }
      rows.push(`<Row ss:Height="3">${cells.join("")}</Row>`);
    }
    const width = Math.max(1, index - 1);
    return `<Worksheet ss:Name="${xml(page.date)}"><Table><Column ss:Width="62" ss:Span="${width - 1}"/>
      <Row ss:Height="28">${cell(1, title, { across: width - 1, style: "title" })}</Row>
      <Row ss:Height="22">${cell(1, `${page.date} ${timetableTime(page.startMinute)}〜${timetableTime(page.endMinute)}`, { across: width - 1 })}</Row>
      <Row ss:Height="24">${head1.join("")}</Row><Row ss:Height="24">${head2.join("")}</Row><Row ss:Height="22">${head3.join("")}</Row>
      ${rows.join("")}<Row ss:Height="24">${cell(1, `${school}　MAGNET`, { across: width - 1 })}</Row></Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><FreezePanes/><FrozenNoSplit/><SplitHorizontal>5</SplitHorizontal><TopRowBottomPane>5</TopRowBottomPane></WorksheetOptions></Worksheet>`;
  });
  for (const page of records) {
    sheets.push(`<Worksheet ss:Name="${xml(page.date)} 明細"><Table><Column ss:Width="100" ss:Span="11"/>${[page.headers, ...page.intervals].map(row => `<Row ss:Height="24">${row.map((value, index) => cell(index + 1, value)).join("")}</Row>`).join("")}</Table></Worksheet>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles>
    <Style ss:ID="Default"><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/><Font ss:FontName="Yu Gothic" ss:Size="10"/></Style>
    <Style ss:ID="cell"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
    <Style ss:ID="head" ss:Parent="cell"><Interior ss:Color="#E8F0EA" ss:Pattern="Solid"/><Font ss:Bold="1"/></Style><Style ss:ID="title"><Font ss:Size="16" ss:Bold="1"/></Style>
    <Style ss:ID="event" ss:Parent="cell"><Interior ss:Color="#FFF0BC" ss:Pattern="Solid"/></Style><Style ss:ID="time"><NumberFormat ss:Format="hh:mm"/><Font ss:Size="10"/></Style>
    </Styles>${sheets.join("")}</Workbook>`;
}
