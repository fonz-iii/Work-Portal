/* data/drb-txn-map.js — DRB Usage: built-in transaction type map (from the drb-usage-report skill's txn_map.json).
   Exported transaction type -> report category, QR group and whether it is a financial transaction (a money movement).
   System labels only; no customer data. New types are mapped on screen and saved in the portal folder
   (DRB Usage\\txn_map.json), which is laid over this list. */
window.SBA_DRB_TXN_MAP = {
 "ACCOUNT / CARD UNENROLLMENT": {
  "category": "Account/card unenrollment",
  "qr_group": "",
  "financial": "No"
 },
 "ACCOUNT ENROLLMENT": {
  "category": "Account enrollment",
  "qr_group": "",
  "financial": "Yes"
 },
 "ACCOUNT STATEMENT REQUEST": {
  "category": "Account statement request",
  "qr_group": "",
  "financial": "No"
 },
 "APPLY FOR LOAN": {
  "category": "Apply for loan",
  "qr_group": "",
  "financial": "Yes"
 },
 "BIILSPAYMENT  FROM CASA": {
  "category": "Bills payment",
  "qr_group": "",
  "financial": "Yes"
 },
 "BIILSPAYMENT FOR FAVORITE FROM CARD": {
  "category": "Bills payment",
  "qr_group": "",
  "financial": "Yes"
 },
 "BIILSPAYMENT FOR FAVORITE FROM CASA": {
  "category": "Bills payment",
  "qr_group": "",
  "financial": "Yes"
 },
 "BIILSPAYMENT FROM CARD": {
  "category": "Bills payment",
  "qr_group": "",
  "financial": "Yes"
 },
 "BILLS PAYMENT MAINTENANCE FOR PAYEE": {
  "category": "Manage favorites (bills payment and FT)",
  "qr_group": "",
  "financial": "No"
 },
 "CARD MAINTENANCE - MANAGE CARD LIMITS": {
  "category": "Card management maintenance",
  "qr_group": "",
  "financial": "No"
 },
 "CARD MAINTENANCE - MANAGE CARD STATUS": {
  "category": "Card management maintenance",
  "qr_group": "",
  "financial": "No"
 },
 "CARD MAINTENANCE - MANAGE E-COMMERCE ACCESS": {
  "category": "Card management maintenance",
  "qr_group": "",
  "financial": "No"
 },
 "CASA TO 3RD PARTY ACCOUNT": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO 3RD PARTY CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO FAVORITE ACCOUNT(CASA)": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO FAVORITE CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO OTHER LOCAL BANK": {
  "category": "Fund transfer to other bank",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO OWN ACCOUNT (CASA)": {
  "category": "Fund transfer to own account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CASA TO OWN CARD": {
  "category": "Fund transfer to own account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "CHANGE THE PASSWORD": {
  "category": "Change/forgot password",
  "qr_group": "",
  "financial": "No"
 },
 "CHECKBOOK ORDER": {
  "category": "Check orders",
  "qr_group": "",
  "financial": "Yes"
 },
 "DELETE RECURRING TRANSACTION": {
  "category": "Manage recurring transaction (add, update and delete)",
  "qr_group": "",
  "financial": "No"
 },
 "DEPOSITED CHECK ENQUIRY": {
  "category": "Check enquiries",
  "qr_group": "",
  "financial": "No"
 },
 "FORGOT PASSWORD": {
  "category": "Change/forgot password",
  "qr_group": "",
  "financial": "No"
 },
 "FUND TRANSFER MAINTENANCE FOR FAVORITE": {
  "category": "Manage favorites (bills payment and FT)",
  "qr_group": "",
  "financial": "No"
 },
 "ISSUED CHECK ENQUIRY": {
  "category": "Check enquiries",
  "qr_group": "",
  "financial": "No"
 },
 "LOAN PAYMENT": {
  "category": "Loan payment",
  "qr_group": "",
  "financial": "Yes"
 },
 "MAINTAINING THE LIMIT FOR TRANSCATION": {
  "category": "Maintaining the limit for transaction",
  "qr_group": "",
  "financial": "No"
 },
 "MANAGE ALERT": {
  "category": "Manage alerts",
  "qr_group": "",
  "financial": "No"
 },
 "MANAGER'S CHECK ORDER": {
  "category": "Check orders",
  "qr_group": "",
  "financial": "Yes"
 },
 "NEW RECURRING TRANSACTION": {
  "category": "Manage recurring transaction (add, update and delete)",
  "qr_group": "",
  "financial": "No"
 },
 "PREPAID CARD TO 3RD PARTY ACCOUNT": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO 3RD PARTY CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO FAVORITE ACCOUNT(CASA)": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO FAVORITE CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO OTHER LOCAL BANK": {
  "category": "Fund transfer to other bank",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO OWN ACCOUNT (CASA)": {
  "category": "Fund transfer to own account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "PREPAID CARD TO OWN CARD": {
  "category": "Fund transfer to own account/card",
  "qr_group": "",
  "financial": "Yes"
 },
 "QR ACTIVATION": {
  "category": "QR activation",
  "qr_group": "QR activation",
  "financial": "No"
 },
 "QR CASA TO 3RD PARTY ACCOUNT": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "QR fund transfer to 3rd party account",
  "financial": "Yes"
 },
 "QR CASA TO 3RD PARTY CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "QR fund transfer to 3rd party account",
  "financial": "Yes"
 },
 "QR CASA TO OWN ACCOUNT (CASA)": {
  "category": "Fund transfer to own account/card",
  "qr_group": "QR fund transfer to own account",
  "financial": "Yes"
 },
 "QR CASA TO OWN CARD": {
  "category": "Fund transfer to own account/card",
  "qr_group": "QR fund transfer to own account",
  "financial": "Yes"
 },
 "QR P2B FROM CASA": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2B",
  "financial": "Yes"
 },
 "QR P2B FROM PREPAID": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2B",
  "financial": "Yes"
 },
 "QR P2M FROM CASA": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2M",
  "financial": "Yes"
 },
 "QR P2M FROM PREPAID": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2M",
  "financial": "Yes"
 },
 "QR P2MICRO FROM CASA": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2Micro",
  "financial": "Yes"
 },
 "QR P2MICRO FROM PREPAID": {
  "category": "QR Pay (P2M, P2B and P2Micro)",
  "qr_group": "QR P2Micro",
  "financial": "Yes"
 },
 "QR P2P CASA TO OTHER BANK": {
  "category": "Fund transfer to other bank",
  "qr_group": "QR fund transfer to other bank",
  "financial": "Yes"
 },
 "QR P2P PREPAID TO OTHER BANK": {
  "category": "Fund transfer to other bank",
  "qr_group": "QR fund transfer to other bank",
  "financial": "Yes"
 },
 "QR PREPAID CARD TO 3RD PARTY ACCOUNT": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "QR fund transfer to 3rd party account",
  "financial": "Yes"
 },
 "QR PREPAID CARD TO 3RD PARTY CARD": {
  "category": "Fund transfer to 3rd party account/card",
  "qr_group": "QR fund transfer to 3rd party account",
  "financial": "Yes"
 },
 "QR PREPAID CARD TO OWN ACCOUNT (CASA)": {
  "category": "Fund transfer to own account/card",
  "qr_group": "QR fund transfer to own account",
  "financial": "Yes"
 },
 "SIGN UP/ONLINE ENROLLMENT": {
  "category": "Sign up/online enrollment",
  "qr_group": "",
  "financial": "No"
 },
 "TIME DEPOSIT PLACEMENT": {
  "category": "Time deposit (placement and upliftment)",
  "qr_group": "",
  "financial": "Yes"
 },
 "TIME DEPOSIT UPLIFTMENT": {
  "category": "Time deposit (placement and upliftment)",
  "qr_group": "",
  "financial": "Yes"
 },
 "UPDATE RECURRING TRANSACTION": {
  "category": "Manage recurring transaction (add, update and delete)",
  "qr_group": "",
  "financial": "No"
 }
};
