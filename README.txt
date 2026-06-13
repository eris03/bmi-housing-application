BMI Housing Society – Online Application Form
=============================================

WHAT THIS IS
------------
A small, self-contained application that lets a customer fill the official
society forms and download them as PDFs in the exact same format as the
printed form (same colours, layout and content).

There are TWO applications to choose from:
  A) Application for Purchase of Site   (downloads as a 2-page PDF)
  B) Application for Membership         (downloads as a 2-page PDF)

Everything runs locally in your web browser. Nothing is sent over the internet,
and no installation is required.

HOW TO USE
----------
1. Double-click "Open Application Form.bat"  (or open index.html in Chrome/Edge).
2. On the first screen, choose which application you want to fill.
3. Fill in the form fields. (Use "Change application" to switch.)
4. Sign in the signature box (draw with mouse / trackpad / finger), or leave
   it blank to sign by hand after printing.
5. Click "Download ... Application PDF".
6. The filled PDF is saved to your Downloads folder:
      Purchase   -> BMI_Purchase_of_Site_<Name>.pdf
      Membership -> BMI_Membership_<Name>.pdf

The PHOTOGRAPH box on the membership form is left blank on purpose, so a
physical passport photo can be pasted onto the printed copy.

Your entries are auto-saved in the browser, so you can close the page and come
back later to finish or re-download.

WHAT'S IN THIS FOLDER (keep them all together)
-----------------------------------------------
  index.html .............. the form page
  app.js .................. form logic (collect, save, download)
  overlay.js .............. draws your details onto the official PDF
  template.js ............. the original blank PDF, embedded
  lib/pdf-lib.min.js ...... PDF library (offline copy)
  Open Application Form.bat  convenience launcher

NOTES
-----
- The membership fees are fixed and already printed on the form
  (Membership 300 + Share Fee 100 + Share Amount 2000 + Admission 100 = 2500).
- Your drawn signature is placed on the "Signature of the Applicant" line.
- The "For office use / Board decision" sections are intentionally left blank
  to be filled by the society.
- Best viewed in Google Chrome or Microsoft Edge.
