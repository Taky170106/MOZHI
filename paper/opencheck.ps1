# Open the project document in Word, report what it contains, and export a
# PDF for visual inspection. The document is opened read-only; the
# unrelated SignGuard report that is already open in Word is never touched.
param(
    [string]$Docx = "D:\VIT\FALL26\NLP_NEW\Mozhi-Project-Document.docx",
    [string]$Pdf  = "C:\Users\tamiz\AppData\Local\Temp\opencode\Mozhi-Project-Document.pdf"
)

$ErrorActionPreference = "Stop"
$word = $null
$doc  = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $doc = $word.Documents.Open($Docx, $false, $true)   # ConfirmConversions, ReadOnly

    "opened without a repair prompt"
    "  sections      : {0}" -f $doc.Sections.Count
    "  paragraphs    : {0}" -f $doc.Paragraphs.Count
    "  inline shapes : {0}" -f $doc.InlineShapes.Count
    "  tables        : {0}" -f $doc.Tables.Count
    "  words         : {0}" -f $doc.ComputeStatistics(0)   # wdStatisticWords
    "  pages         : {0}" -f $doc.ComputeStatistics(2)   # wdStatisticPages
    "  characters    : {0}" -f $doc.ComputeStatistics(3)   # wdStatisticCharacters

    $sec = $doc.Sections.Item(1)
    "  page width    : {0:N2} pt" -f $sec.PageSetup.PageWidth
    "  left margin   : {0:N2} pt" -f $sec.PageSetup.LeftMargin
    "  text width    : {0:N2} pt" -f ($sec.PageSetup.PageWidth - $sec.PageSetup.LeftMargin - $sec.PageSetup.RightMargin)
    "  text columns  : {0}" -f $sec.PageSetup.TextColumns.Count

    if ($doc.Revisions.Count -gt 0) {
        "  revisions     : {0} (tracked changes present)" -f $doc.Revisions.Count
    } else {
        "  revisions     : 0"
    }
    "  spelling errs : {0}" -f $doc.SpellingErrors.Count

    if (Test-Path $Pdf) { Remove-Item $Pdf -Force }
    $doc.ExportAsFixedFormat($Pdf, 17)   # wdExportFormatPDF
    "  exported      : {0}" -f $Pdf
    "  pdf bytes     : {0}" -f (Get-Item $Pdf).Length
}
catch {
    "FAILED: {0}" -f $_.Exception.Message
    if ($_.Exception.InnerException) {
        "  inner: {0}" -f $_.Exception.InnerException.Message
    }
    exit 1
}
finally {
    if ($doc)   { $doc.Close(0) }          # wdDoNotSaveChanges
    if ($word)  { $word.Quit() }
    if ($doc)   { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
    if ($word)  { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
    [GC]::Collect()
}
