"""High-stakes meaning-check test set (hs1): medical instructions and legal/official text from US
federal sources (public domain), each with one planted critical error, written by hand.
Sentences are quoted or lightly adapted to stand alone. Drug Facts lines follow FDA's required
label wording (21 CFR 201.66)."""
import json
SRC = {
 "fda-apap": "https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/acetaminophen",
 "fda-label": "FDA Drug Facts label wording (21 CFR 201.66), acetaminophen products",
 "nia": "https://www.nia.nih.gov/health/medicines-and-medication-management/taking-medicines-safely-you-age",
 "cdc-flu": "https://www.cdc.gov/flu/treatment/antiviral-drugs.html",
 "fda-disposal": "https://www.fda.gov/drugs/safe-disposal-medicines/disposal-unused-medicines-what-you-should-know",
 "fda-kids": "https://www.fda.gov/consumers/consumer-updates/should-you-give-kids-medicine-coughs-and-colds",
 "niddk": "https://www.niddk.nih.gov/health-information/diabetes/overview/insulin-medicines-treatments",
 "cfpb": "https://www.consumerfinance.gov/ask-cfpb/what-information-does-a-debt-collector-have-to-give-me-about-the-debt-en-331/",
 "ssa": "https://www.ssa.gov/ssi/text-report-ussi.htm",
 "uscis": "https://www.uscis.gov/green-card/after-we-grant-your-green-card/replace-your-green-card",
 "eeoc": "https://www.eeoc.gov/how-file-charge-employment-discrimination",
 "ftc": "https://consumer.ftc.gov/articles/buyers-remorse-ftcs-cooling-rule-may-help",
 "irs": "https://www.irs.gov/payments/payment-plans-installment-agreements",
}
# (domain, error type, source, correct sentence, sentence with the planted error)
M, L = "medical", "legal"
ITEMS = [
# ---------- medical: number ----------
(M,"number","fda-apap","The maximum total amount of acetaminophen taken in 24 hours should not be more than 4,000 mg for adults and children 12 years of age and older.","The maximum total amount of acetaminophen taken in 24 hours should not be more than 6,000 mg for adults and children 12 years of age and older."),
(M,"number","fda-apap","Severe liver damage may occur if you have three or more alcoholic drinks per day while using acetaminophen.","Severe liver damage may occur if you have five or more alcoholic drinks per day while using acetaminophen."),
(M,"number","cdc-flu","Oseltamivir and zanamivir are given twice a day for five days.","Oseltamivir and zanamivir are given twice a day for ten days."),
(M,"number","cdc-flu","Peramivir is approved for early treatment of flu in people 6 months and older.","Peramivir is approved for early treatment of flu in people 2 months and older."),
(M,"number","cdc-flu","Baloxavir is approved for early treatment of uncomplicated flu in people 5 years and older.","Baloxavir is approved for early treatment of uncomplicated flu in people 2 years and older."),
(M,"number","niddk","Some people with diabetes who take insulin need 2 to 4 shots a day to reach their blood glucose targets.","Some people with diabetes who take insulin need 6 to 8 shots a day to reach their blood glucose targets."),
(M,"number","fda-kids","Call a doctor if an infant 2 months or younger has a fever of 100.4 degrees Fahrenheit or higher.","Call a doctor if an infant 2 months or younger has a fever of 102.4 degrees Fahrenheit or higher."),
(M,"number","fda-kids","The FDA doesn't recommend over-the-counter medicines for cough and cold symptoms in children younger than 2.","The FDA doesn't recommend over-the-counter medicines for cough and cold symptoms in children younger than 1."),
(M,"number","fda-label","Adults and children 12 years and over: take 2 caplets every 6 hours while symptoms last.","Adults and children 12 years and over: take 2 caplets every 2 hours while symptoms last."),
(M,"number","fda-label","Do not take more than 6 caplets in 24 hours, unless directed by a doctor.","Do not take more than 10 caplets in 24 hours, unless directed by a doctor."),
# ---------- medical: unit ----------
(M,"unit","fda-apap","The maximum amount of acetaminophen in 24 hours should not be more than 4,000 mg for adults.","The maximum amount of acetaminophen in 24 hours should not be more than 4,000 g for adults."),
(M,"unit","cdc-flu","Flu antiviral drugs are usually taken for five days.","Flu antiviral drugs are usually taken for five weeks."),
(M,"unit","cdc-flu","Antiviral drugs work best when started within 1 to 2 days after flu symptoms begin.","Antiviral drugs work best when started within 1 to 2 weeks after flu symptoms begin."),
(M,"unit","niddk","Premixed insulin starts to work in 15 to 60 minutes and can last from 10 to 16 hours.","Premixed insulin starts to work in 15 to 60 hours and can last from 10 to 16 hours."),
(M,"unit","niddk","With gestational diabetes, brisk walking for 150 minutes each week can help you manage your blood glucose level.","With gestational diabetes, brisk walking for 150 minutes each day can help you manage your blood glucose level."),
(M,"unit","niddk","The plastic tube of an insulin pump stays inserted for several days.","The plastic tube of an insulin pump stays inserted for several hours."),
(M,"unit","fda-label","Do not use for more than 10 days for pain unless directed by a doctor.","Do not use for more than 10 weeks for pain unless directed by a doctor."),
(M,"unit","fda-label","Stop use and ask a doctor if fever gets worse or lasts more than 3 days.","Stop use and ask a doctor if fever gets worse or lasts more than 3 weeks."),
(M,"unit","fda-kids","Call a doctor if an infant has a fever of 100.4 degrees Fahrenheit or higher.","Call a doctor if an infant has a fever of 100.4 degrees Celsius or higher."),
(M,"unit","nia","Taking medicines on an empty stomach generally means taking your pills at least two hours before you eat.","Taking medicines on an empty stomach generally means taking your pills at least two minutes before you eat."),
# ---------- medical: negation ----------
(M,"negation","fda-apap","Do not use more than one acetaminophen-containing product at a time.","Use more than one acetaminophen-containing product at a time."),
(M,"negation","fda-apap","Never take more acetaminophen than what the label says, even if you still have fever or pain.","Take more acetaminophen than what the label says if you still have fever or pain."),
(M,"negation","fda-apap","Do not use a product intended for adults if the child is less than 12 years of age.","Use a product intended for adults if the child is less than 12 years of age."),
(M,"negation","fda-apap","If giving liquid acetaminophen, do not use a kitchen spoon or a dosing device from a different product.","If giving liquid acetaminophen, use a kitchen spoon or a dosing device from a different product."),
(M,"negation","fda-apap","Do not stop taking any prescribed drugs without first talking to your health care professional.","Stop taking any prescribed drugs without first talking to your health care professional."),
(M,"negation","nia","When flying, carry your medicines with you; do not pack them in your checked luggage.","When flying, do not carry your medicines with you; pack them in your checked luggage."),
(M,"negation","nia","Do not chew, break, or crush tablets without first asking if this will change the way the drug works.","Chew, break, or crush tablets without first asking if this will change the way the drug works."),
(M,"negation","cdc-flu","Baloxavir is not recommended for treatment of flu during pregnancy or while breastfeeding.","Baloxavir is recommended for treatment of flu during pregnancy or while breastfeeding."),
(M,"negation","nia","Even if you are feeling better, you should not stop taking your prescription drug unless your doctor says it's okay.","Even if you are not feeling better, you should stop taking your prescription drug unless your doctor says it's okay."),
(M,"negation","fda-disposal","Don't crush pills before mixing them with dirt, cat litter, or used coffee grounds.","Crush the pills before mixing them with dirt, cat litter, or used coffee grounds."),
# ---------- medical: direction / timing ----------
(M,"direction","cdc-flu","Flu antiviral drugs should ideally be started within two days after becoming sick.","Flu antiviral drugs should ideally be started only after two days of being sick."),
(M,"direction","fda-apap","Ask your health care professional before use if you have liver disease.","Ask your health care professional after use if you have liver disease."),
(M,"direction","nia","Check the label on your medicine before leaving the pharmacy.","Check the label on your medicine after leaving the pharmacy."),
(M,"direction","fda-kids","The FDA doesn't recommend over-the-counter cough and cold medicines for children younger than 2.","The FDA doesn't recommend over-the-counter cough and cold medicines for children older than 2."),
(M,"direction","fda-kids","Call a doctor if an infant 2 months or younger has a fever of 100.4 degrees Fahrenheit or higher.","Call a doctor if an infant 2 months or younger has a fever of 100.4 degrees Fahrenheit or lower."),
(M,"direction","cdc-flu","Peramivir is approved for early treatment of flu in people 6 months and older.","Peramivir is approved for early treatment of flu in people 6 months and younger."),
(M,"direction","fda-label","Stop use and ask a doctor if fever gets worse or lasts more than 3 days.","Stop use and ask a doctor if fever gets worse or lasts less than 3 days."),
(M,"direction","fda-apap","The total amount of acetaminophen taken in 24 hours should not be more than 4,000 mg for adults.","The total amount of acetaminophen taken in 24 hours should not be less than 4,000 mg for adults."),
(M,"direction","nia","When you travel, ask your doctor or pharmacist about changes to your medicine schedule before you depart.","When you travel, ask your doctor or pharmacist about changes to your medicine schedule after you return."),
(M,"direction","fda-apap","If you think you have taken too much acetaminophen, get medical help right away.","If you think you have taken too little acetaminophen, get medical help right away."),
# ---------- medical: condition ----------
(M,"condition","fda-label","Do not take more than 6 caplets in 24 hours, unless directed by a doctor.","Do not take more than 6 caplets in 24 hours, even if directed by a doctor."),
(M,"condition","fda-label","Do not use for more than 10 days for pain unless directed by a doctor.","Do not use for more than 10 days for pain if directed by a doctor."),
(M,"condition","fda-label","If pregnant or breast-feeding, ask a health professional before use.","Unless pregnant or breast-feeding, ask a health professional before use."),
(M,"condition","fda-apap","Serious skin reactions can occur even if you have taken acetaminophen in the past without any problems.","Serious skin reactions can occur only if you have never taken acetaminophen before."),
(M,"condition","fda-apap","If you develop any skin rash while using a medication containing acetaminophen, stop the medication and seek medical attention immediately.","Unless you develop a skin rash while using a medication containing acetaminophen, stop the medication and seek medical attention immediately."),
(M,"condition","fda-disposal","Don't flush any medicine unless it is on the Flush List.","Don't flush any medicine if it is on the Flush List."),
(M,"condition","fda-kids","Nonprescription cough and cold products can be harmful to children if they get more than the recommended dose.","Nonprescription cough and cold products can be harmful to children unless they get more than the recommended dose."),
(M,"condition","fda-apap","Ask your health care professional before use if you have liver disease.","Ask your health care professional before use unless you have liver disease."),
(M,"condition","fda-apap","If you have had a serious skin reaction with acetaminophen, do not take any products containing acetaminophen again.","Unless you have had a serious skin reaction with acetaminophen, do not take any products containing acetaminophen again."),
(M,"condition","cdc-flu","CDC recommends prompt treatment for people who have flu and who are at increased risk of serious flu complications.","CDC recommends prompt treatment for people who have flu or who are at increased risk of serious flu complications."),
# ---------- medical: role (who / whom) ----------
(M,"role","niddk","Inhaled insulin is only for adults with type 1 or type 2 diabetes.","Inhaled insulin is only for children with type 1 or type 2 diabetes."),
(M,"role","niddk","An artificial pancreas is mainly used to help people with type 1 diabetes.","An artificial pancreas is mainly used to help people with type 2 diabetes."),
(M,"role","cdc-flu","Oseltamivir is recommended by CDC for treatment of flu in children beginning from birth.","Oseltamivir is recommended by CDC for treatment of flu in adults beginning from age 65."),
(M,"role","nia","Tell the pharmacist if you have trouble swallowing pills.","The pharmacist will tell you if you have trouble swallowing pills."),
(M,"role","nia","Ask your pharmacist to explain any terms or abbreviations on your prescription label that you don't understand.","Your pharmacist will ask you to explain any terms or abbreviations on your prescription label that they don't understand."),
(M,"role","fda-apap","A health care professional should evaluate you to determine if you are experiencing a serious skin reaction.","You should evaluate yourself to determine if you are experiencing a serious skin reaction."),
(M,"role","fda-apap","Inform your health care professional of all drugs, vitamins, and supplements you take.","Your health care professional will inform you of all drugs, vitamins, and supplements you take."),
(M,"role","fda-apap","Contact your child's health care professional if you are unsure how to measure a dose.","Your child's health care professional will contact you if they are unsure how to measure a dose."),
(M,"role","cdc-flu","Baloxavir is not recommended for treatment of flu in hospitalized patients.","Baloxavir is not recommended for treatment of flu in outpatients."),
(M,"role","nia","Do not take medicines prescribed for another person.","Do not take medicines prescribed for you."),
# ---------- legal: number ----------
(L,"number","cfpb","Once you receive the debt validation information, you have 30 days to dispute the debt in writing.","Once you receive the debt validation information, you have 60 days to dispute the debt in writing."),
(L,"number","cfpb","This information is provided in a written notice within five days of the debt collector's first communication with you.","This information is provided in a written notice within fifteen days of the debt collector's first communication with you."),
(L,"number","ssa","Report any changes that may affect your SSI no later than 10 days after the end of the month in which the change occurred.","Report any changes that may affect your SSI no later than 30 days after the end of the month in which the change occurred."),
(L,"number","ssa","We may apply a penalty that will reduce your SSI payment by $25 to $100 for each time you fail to report a change.","We may apply a penalty that will reduce your SSI payment by $250 to $1,000 for each time you fail to report a change."),
(L,"number","ssa","The first sanction period is a withholding of payments for 6 months.","The first sanction period is a withholding of payments for 3 months."),
(L,"number","uscis","You must replace your Green Card if it is expired or will expire within the next six months.","You must replace your Green Card if it is expired or will expire within the next twelve months."),
(L,"number","uscis","Please wait 72 hours after you filed your Form I-90 to check your case status.","Please wait 12 hours after you filed your Form I-90 to check your case status."),
(L,"number","eeoc","The 180-calendar-day filing deadline is extended to 300 calendar days if a state or local agency enforces a law that prohibits the same discrimination.","The 180-calendar-day filing deadline is extended to 400 calendar days if a state or local agency enforces a law that prohibits the same discrimination."),
(L,"number","ftc","The Cooling-Off Rule gives you three days to cancel certain sales made at your home, workplace, or dormitory.","The Cooling-Off Rule gives you ten days to cancel certain sales made at your home, workplace, or dormitory."),
(L,"number","irs","You may qualify to apply online for a long-term payment plan if you owe $50,000 or less in combined tax, penalties and interest.","You may qualify to apply online for a long-term payment plan if you owe $500,000 or less in combined tax, penalties and interest."),
# ---------- legal: unit ----------
(L,"unit","ftc","The Cooling-Off Rule gives you three days to cancel certain sales made at your home.","The Cooling-Off Rule gives you three weeks to cancel certain sales made at your home."),
(L,"unit","ssa","Report changes no later than 10 days after the end of the month in which the change occurred.","Report changes no later than 10 months after the end of the month in which the change occurred."),
(L,"unit","uscis","This notice provides evidence of your lawful permanent resident status for 36 months from the expiration date on your card.","This notice provides evidence of your lawful permanent resident status for 36 days from the expiration date on your card."),
(L,"unit","uscis","Please wait 72 hours after you filed your Form I-90 to check your case status.","Please wait 72 days after you filed your Form I-90 to check your case status."),
(L,"unit","irs","Applicants should submit the form to the IRS within 30 days from the date of their installment agreement acceptance letter.","Applicants should submit the form to the IRS within 30 weeks from the date of their installment agreement acceptance letter."),
(L,"unit","irs","Allow one to three weeks for a recent payment to be credited to your account.","Allow one to three months for a recent payment to be credited to your account."),
(L,"unit","irs","A short-term payment plan means paying in 180 days or less.","A short-term payment plan means paying in 180 weeks or less."),
(L,"unit","irs","If the requested installment agreement is rejected, the running of the collection period is suspended for 30 days.","If the requested installment agreement is rejected, the running of the collection period is suspended for 30 months."),
(L,"unit","ssa","Subsequent sanction periods are for 12 months and then 24 months.","Subsequent sanction periods are for 12 weeks and then 24 weeks."),
(L,"unit","eeoc","Our offices are open from 8:00 a.m. to 4:30 p.m. Monday through Friday.","Our offices are open from 8:00 p.m. to 4:30 a.m. Monday through Friday."),
# ---------- legal: negation ----------
(L,"negation","uscis","You cannot appeal a denial.","You can appeal a denial."),
(L,"negation","ssa","You may be underpaid if you do not report changes on time.","You may be underpaid if you report changes on time."),
(L,"negation","ftc","Some types of sales can't be canceled, even if they occur in places that the Cooling-Off Rule normally covers.","Some types of sales can be canceled, even if they occur in places that the Cooling-Off Rule normally covers."),
(L,"negation","ftc","Saturday is considered a business day, but Sundays and federal holidays are not.","Saturday is not considered a business day, and neither are Sundays and federal holidays."),
(L,"negation","irs","If you qualify for a short-term payment plan you will not be liable for a user fee.","If you qualify for a short-term payment plan you will be liable for a user fee."),
(L,"negation","irs","There's also a penalty for failure to file a tax return, so you should file on time even if you can't pay your balance in full.","There's no penalty for failure to file a tax return, so you don't need to file on time if you can't pay your balance in full."),
(L,"negation","eeoc","The deadline is not extended if only a local law prohibits age discrimination.","The deadline is extended if only a local law prohibits age discrimination."),
(L,"negation","uscis","You must replace your Green Card if your card contains incorrect information.","You do not need to replace your Green Card if your card contains incorrect information."),
(L,"negation","cfpb","The debt collector must pause collecting the amount of the debt you are disputing until they've adequately responded to your request.","The debt collector does not have to pause collecting the amount of the debt you are disputing until they've adequately responded to your request."),
(L,"negation","ftc","The contract or receipt must be in the same language that's used in the sales presentation.","The contract or receipt does not have to be in the same language that's used in the sales presentation."),
# ---------- legal: direction / timing ----------
(L,"direction","ftc","Make sure the envelope is postmarked before midnight of the third business day after the contract date.","Make sure the envelope is postmarked after midnight of the third business day after the contract date."),
(L,"direction","ftc","If the sale happens on a Monday in a week without a federal holiday, you have until midnight on Thursday to cancel.","If the sale happens on a Monday in a week without a federal holiday, you have until midnight on Tuesday to cancel."),
(L,"direction","uscis","If you are outside the United States and your Green Card will expire within six months, you should file Form I-90 as soon as you return to the United States.","If you are outside the United States and your Green Card will expire within six months, you should file Form I-90 before you return to the United States."),
(L,"direction","irs","You may qualify for a long-term payment plan if you owe $50,000 or less in combined tax, penalties and interest.","You may qualify for a long-term payment plan if you owe $50,000 or more in combined tax, penalties and interest."),
(L,"direction","irs","You may qualify for a short-term payment plan if you owe less than $100,000 in combined tax, penalties and interest.","You may qualify for a short-term payment plan if you owe more than $100,000 in combined tax, penalties and interest."),
(L,"direction","uscis","You must replace your Green Card if you received it before you were 14 and you have reached your 14th birthday.","You must replace your Green Card if you received it after you were 14 and you have reached your 14th birthday."),
(L,"direction","ssa","Report any changes as soon as possible and no later than 10 days after the end of the month in which the change occurred.","Report any changes no earlier than 10 days after the end of the month in which the change occurred."),
(L,"direction","eeoc","If your filing deadline is fast approaching, call 1-800-669-4000 to ask for an immediate interview.","If your filing deadline has already passed, call 1-800-669-4000 to ask for an immediate interview."),
(L,"direction","eeoc","You must file a charge with the EEOC before you can file a lawsuit for unlawful discrimination.","You must file a charge with the EEOC after you file a lawsuit for unlawful discrimination."),
(L,"direction","irs","Applicants should submit the form within 30 days from the date of their installment agreement acceptance letter.","Applicants should submit the form at least 30 days after the date of their installment agreement acceptance letter."),
# ---------- legal: condition ----------
(L,"condition","irs","If you qualify for a short-term payment plan, you will not be charged a user fee.","Unless you qualify for a short-term payment plan, you will not be charged a user fee."),
(L,"condition","irs","If you are a low-income taxpayer, the user fee is waived if you agree to make electronic debit payments.","If you are a low-income taxpayer, the user fee is waived unless you agree to make electronic debit payments."),
(L,"condition","ftc","If the seller gave you any items, you must make them available to the seller in as good condition as when you got them.","Unless the seller gave you any items, you must make them available to the seller in as good condition as when you got them."),
(L,"condition","eeoc","For age discrimination, the filing deadline is only extended to 300 days if there is a state law prohibiting age discrimination and a state agency enforcing that law.","For age discrimination, the filing deadline is only extended to 300 days if there is a state law prohibiting age discrimination or a state agency enforcing that law."),
(L,"condition","irs","You may qualify to apply online if you owe $50,000 or less in combined tax, penalties and interest, and filed all required returns.","You may qualify to apply online if you owe $50,000 or less in combined tax, penalties and interest, or filed all required returns."),
(L,"condition","ssa","If you knowingly fail to report important changes, we may impose a sanction against your payments.","Unless you knowingly fail to report important changes, we may impose a sanction against your payments."),
(L,"condition","cfpb","If you send the debt collector a written verification request within this 30-day period, the debt collector must pause collecting the amount you are disputing.","Unless you send the debt collector a written verification request within this 30-day period, the debt collector must pause collecting the amount you are disputing."),
(L,"condition","uscis","If you received your card before you were 14, you must replace it when you turn 14, unless your card expires before your 16th birthday.","If you received your card before you were 14, you must replace it when you turn 14, if your card expires before your 16th birthday."),
(L,"condition","uscis","If we approve your application, we will mail you a new Green Card.","Unless we approve your application, we will mail you a new Green Card."),
(L,"condition","ftc","If you don't make the items available to the seller, you remain responsible for paying the seller as you agreed under the contract.","Even if you make the items available to the seller, you remain responsible for paying the seller as you agreed under the contract."),
# ---------- legal: role (who does what) ----------
(L,"role","ftc","The seller must give you two copies of a cancellation form.","You must give the seller two copies of a cancellation form."),
(L,"role","ftc","If the seller gave you any items, you must make them available to the seller.","If you gave the seller any items, the seller must make them available to you."),
(L,"role","uscis","If we determine you must submit biometrics, we will mail you a biometrics appointment notice.","If we determine you must submit biometrics, you must mail us a biometrics appointment request."),
(L,"role","ssa","You must report any of these changes to us, because they may affect your eligibility for SSI.","We must report any of these changes to you, because they may affect your eligibility for SSI."),
(L,"role","ssa","We may overpay you, and you may have to pay us back.","You may overpay us, and we may have to pay you back."),
(L,"role","cfpb","Once you receive the debt validation information, you have 30 days to dispute the debt in writing.","Once the debt collector receives your information, they have 30 days to dispute the debt in writing."),
(L,"role","cfpb","The debt collector must give you the name of the creditor you owe the debt to.","You must give the debt collector the name of the creditor you owe the debt to."),
(L,"role","irs","If the IRS approves your payment plan, a setup fee will be charged to you.","If the IRS approves your payment plan, a setup fee will be paid to you."),
(L,"role","uscis","You may submit a motion to reopen to the same office that made the unfavorable decision.","You may submit a motion to reopen to a different office than the one that made the unfavorable decision."),
(L,"role","irs","If you are a sole proprietor or independent contractor, apply for a payment plan as an individual.","If you are a sole proprietor or independent contractor, apply for a payment plan as a business."),
]
assert len(ITEMS) == 120, len(ITEMS)
items, seen = [], {}
for i, (dom, kind, src, en, bad) in enumerate(ITEMS):
    assert en != bad, en
    n = seen.get((dom, kind), 0); seen[(dom, kind)] = n + 1
    items.append({"id": 9001 + i, "domain": dom, "kind": kind, "source": SRC[src], "en": en, "bad_en": bad,
                  "split": "dev" if n < 2 else "test"})  # first 2 of each domain × type: development; the rest stay sealed
langs = ["vie_Latn", "jpn_Jpan", "kor_Hang", "zho_Hans", "spa_Latn", "arb_Arab", "hin_Deva", "fra_Latn", "tgl_Latn", "por_Latn", "urd_Arab"]
json.dump({"langs": langs, "items": items}, open("items-hs1.json", "w"), ensure_ascii=False, indent=1)
import collections
print(collections.Counter((x["domain"], x["kind"], x["split"]) for x in items).most_common(3), len(items))
print(collections.Counter(x["split"] for x in items))
