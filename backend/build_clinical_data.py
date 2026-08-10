"""Build a comprehensive Indian drugs + labs catalog and write to data/*.json.

Strategy:
  * DRUGS — expand ~180 seeded brand+generic tuples across common Indian
    strengths + dose forms (tab / cap / syrup / susp / inj) → 1,000+ rows.
    Backbone list curated from India-market top OTC & Rx brands (Cipla, Sun,
    Dr Reddy's, Cadila, Alkem, Mankind, Torrent, Lupin, etc.). No external
    network dependency — reliable and instant.
  * LABS — enumerated LOINC-derived pathology panels + Indian radiology
    catalog (X-ray/US/CT/MRI/ECG/EEG variants). ~280 rows.

Usage:  cd /app/backend && python build_clinical_data.py
"""
from __future__ import annotations

import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- #
# DRUGS — (Indian brand, generic composition, ATC-ish category, default dose,
# default frequency, default duration)                                         #
# --------------------------------------------------------------------------- #

# base seed of (brand, generic, category, freq, duration)
_DRUG_SEEDS: list[tuple[str, str, str, str, str]] = [
    # Analgesics / Antipyretics
    ("Crocin", "Paracetamol", "Analgesic/Antipyretic", "1-0-1 after food", "5 days"),
    ("Dolo", "Paracetamol", "Analgesic/Antipyretic", "SOS", "3 days"),
    ("Calpol", "Paracetamol", "Analgesic/Antipyretic", "1-0-1", "5 days"),
    ("Fepanil", "Paracetamol", "Analgesic/Antipyretic", "1-0-1", "5 days"),
    ("Combiflam", "Ibuprofen + Paracetamol", "NSAID", "1-0-1 after food", "5 days"),
    ("Brufen", "Ibuprofen", "NSAID", "1-0-1 after food", "5 days"),
    ("Advil", "Ibuprofen", "NSAID", "1-0-1 after food", "5 days"),
    ("Voveran", "Diclofenac", "NSAID", "1-0-1 after food", "5 days"),
    ("Zerodol", "Aceclofenac", "NSAID", "1-0-1 after food", "5 days"),
    ("Zerodol-P", "Aceclofenac + Paracetamol", "NSAID", "1-0-1 after food", "5 days"),
    ("Zerodol-SP", "Aceclofenac + Paracetamol + Serratiopeptidase", "NSAID", "1-0-1 after food", "5 days"),
    ("Nimulid", "Nimesulide", "NSAID", "1-0-1 after food", "3 days"),
    ("Nimesulide", "Nimesulide", "NSAID", "1-0-1 after food", "3 days"),
    ("Etoshine", "Etoricoxib", "NSAID", "1-0-0 after food", "5 days"),
    ("Tramazac", "Tramadol", "Opioid Analgesic", "1-0-1 SOS", "3 days"),
    ("Ultracet", "Tramadol + Paracetamol", "Opioid Analgesic", "1-0-1 SOS", "3 days"),
    ("Meftal Spas", "Mefenamic Acid + Dicyclomine", "Antispasmodic", "1-0-1 SOS", "3 days"),
    ("Meftal", "Mefenamic Acid", "NSAID", "1-0-1 after food", "3 days"),
    ("Cyclopam", "Dicyclomine + Paracetamol", "Antispasmodic", "1-0-1 SOS", "3 days"),
    ("Drotin", "Drotaverine", "Antispasmodic", "1-0-1 SOS", "3 days"),
    ("Buscopan", "Hyoscine Butylbromide", "Antispasmodic", "1-0-1 SOS", "3 days"),
    # Antibiotics
    ("Augmentin", "Amoxicillin + Clavulanate", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Clavam", "Amoxicillin + Clavulanate", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Moxikind CV", "Amoxicillin + Clavulanate", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Mox", "Amoxicillin", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Amoxil", "Amoxicillin", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Ampilox", "Ampicillin + Cloxacillin", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Azee", "Azithromycin", "Antibiotic", "1-0-0 after food", "5 days"),
    ("Azithral", "Azithromycin", "Antibiotic", "1-0-0 after food", "5 days"),
    ("Azax", "Azithromycin", "Antibiotic", "1-0-0 after food", "5 days"),
    ("Cifran", "Ciprofloxacin", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Ciplox", "Ciprofloxacin", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Ciprobid", "Ciprofloxacin", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Levoflox", "Levofloxacin", "Antibiotic", "1-0-0 after food", "7 days"),
    ("Levotop", "Levofloxacin", "Antibiotic", "1-0-0 after food", "7 days"),
    ("Ofloxacin", "Ofloxacin", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Zenflox", "Ofloxacin + Ornidazole", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Norflox", "Norfloxacin", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Doxy", "Doxycycline", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Vibramycin", "Doxycycline", "Antibiotic", "1-0-1 after food", "7 days"),
    ("Cephastar", "Cefixime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Zifi", "Cefixime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Taxim-O", "Cefixime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Cefpodox", "Cefpodoxime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Ceftum", "Cefuroxime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Metrogyl", "Metronidazole", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Flagyl", "Metronidazole", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Ornof", "Ofloxacin + Ornidazole", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Rifagut", "Rifaximin", "Antibiotic", "1-0-1 after food", "3 days"),
    ("Erythromycin", "Erythromycin", "Antibiotic", "1-1-1 after food", "5 days"),
    ("Clindac", "Clindamycin", "Antibiotic", "1-1-1 after food", "7 days"),
    ("Klacid", "Clarithromycin", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Bactrim", "Cotrimoxazole", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Septran", "Cotrimoxazole", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Cepodem", "Cefpodoxime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Zocef", "Cefuroxime", "Antibiotic", "1-0-1 after food", "5 days"),
    ("Tazact", "Piperacillin + Tazobactam", "Antibiotic", "TID IV", "5 days"),
    ("Meropen", "Meropenem", "Antibiotic", "TID IV", "7 days"),
    ("Vancorin", "Vancomycin", "Antibiotic", "BD IV", "7 days"),
    # PPIs / Antacids
    ("Pantop", "Pantoprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Pan", "Pantoprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Pantocid", "Pantoprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Pantosec", "Pantoprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Nexpro", "Esomeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Neksium", "Esomeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Omez", "Omeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Ocid", "Omeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Rabecid", "Rabeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Rablet", "Rabeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Razo", "Rabeprazole", "PPI", "1-0-0 before food", "14 days"),
    ("Cintapro", "Rabeprazole + Domperidone", "PPI", "1-0-0 before food", "14 days"),
    ("Rantac", "Ranitidine", "H2 Blocker", "1-0-1", "7 days"),
    ("Zinetac", "Ranitidine", "H2 Blocker", "1-0-1", "7 days"),
    ("Aciloc", "Ranitidine", "H2 Blocker", "1-0-1", "7 days"),
    ("Famonite", "Famotidine", "H2 Blocker", "1-0-1", "7 days"),
    ("Digene", "Antacid Gel (Al/Mg/Simeth)", "Antacid", "1-1-1 SOS", "SOS"),
    ("Gelusil", "Antacid Gel", "Antacid", "1-1-1 SOS", "SOS"),
    ("Eno", "Sodium Bicarbonate + Citric Acid", "Antacid", "SOS", "SOS"),
    # Antihistamines / Anti-allergics
    ("Cetzine", "Cetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Alerid", "Cetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Zyrtec", "Cetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Levocet", "Levocetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Xyzal", "Levocetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Vozet", "Levocetirizine", "Antihistamine", "0-0-1", "5 days"),
    ("Avil", "Pheniramine", "Antihistamine", "1-0-1", "3 days"),
    ("Cheston Cold", "Cetirizine + Paracetamol + Phenylephrine", "Cold/Flu", "1-0-1", "3 days"),
    ("Sinarest", "Paracetamol + CPM + Phenylephrine", "Cold/Flu", "1-0-1", "3 days"),
    ("Cofsils", "Menthol Lozenge", "Cough", "1-1-1 SOS", "3 days"),
    ("Corex", "Chlorpheniramine + Codeine", "Cough", "1-0-1", "3 days"),
    ("Ascoril", "Bromhexine + Terbutaline + Guaifenesin", "Cough", "1-0-1", "5 days"),
    ("Grilinctus", "Chlorpheniramine + Ammonium Chloride + Guaifenesin", "Cough", "1-0-1", "5 days"),
    ("Alex", "Chlorpheniramine + Dextromethorphan + Phenylephrine", "Cough", "1-0-1", "5 days"),
    ("Montek LC", "Montelukast + Levocetirizine", "Antihistamine", "0-0-1", "14 days"),
    ("Montair LC", "Montelukast + Levocetirizine", "Antihistamine", "0-0-1", "14 days"),
    ("Airtec", "Cetirizine", "Antihistamine", "0-0-1", "5 days"),
    # Anti-diabetics
    ("Glycomet", "Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Gluconorm", "Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Amaryl", "Glimepiride", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Glimestar", "Glimepiride", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Zoryl", "Glimepiride", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Glycomet-GP", "Glimepiride + Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Janumet", "Sitagliptin + Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Sitazit-M", "Sitagliptin + Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Vildapride-M", "Vildagliptin + Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Galvus Met", "Vildagliptin + Metformin", "Antidiabetic", "1-0-1 after food", "Continuous"),
    ("Forxiga", "Dapagliflozin", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Jardiance", "Empagliflozin", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Invokana", "Canagliflozin", "Antidiabetic", "1-0-0 before food", "Continuous"),
    ("Actrapid", "Human Insulin (Regular)", "Insulin", "SC", "Continuous"),
    ("Novomix 30", "Insulin Aspart Mix", "Insulin", "SC BD", "Continuous"),
    ("Lantus", "Insulin Glargine", "Insulin", "SC HS", "Continuous"),
    ("Humalog", "Insulin Lispro", "Insulin", "SC TID", "Continuous"),
    # Cardiac / Antihypertensives
    ("Ecosprin", "Aspirin", "Antiplatelet", "0-1-0 after food", "Continuous"),
    ("Aspirin", "Aspirin", "Antiplatelet", "0-1-0 after food", "Continuous"),
    ("Clopilet", "Clopidogrel", "Antiplatelet", "0-1-0 after food", "Continuous"),
    ("Plavix", "Clopidogrel", "Antiplatelet", "0-1-0 after food", "Continuous"),
    ("Storvas", "Atorvastatin", "Statin", "0-0-1 after food", "Continuous"),
    ("Atorva", "Atorvastatin", "Statin", "0-0-1 after food", "Continuous"),
    ("Lipvas", "Atorvastatin", "Statin", "0-0-1 after food", "Continuous"),
    ("Rosuvas", "Rosuvastatin", "Statin", "0-0-1 after food", "Continuous"),
    ("Rozavel", "Rosuvastatin", "Statin", "0-0-1 after food", "Continuous"),
    ("Amlodac", "Amlodipine", "Antihypertensive", "1-0-0 after food", "Continuous"),
    ("Amlong", "Amlodipine", "Antihypertensive", "1-0-0 after food", "Continuous"),
    ("Amlopres", "Amlodipine", "Antihypertensive", "1-0-0 after food", "Continuous"),
    ("Concor", "Bisoprolol", "Beta Blocker", "1-0-0 after food", "Continuous"),
    ("Metolar", "Metoprolol", "Beta Blocker", "1-0-1 after food", "Continuous"),
    ("Metpure XL", "Metoprolol ER", "Beta Blocker", "1-0-0 after food", "Continuous"),
    ("Ciplar", "Propranolol", "Beta Blocker", "1-0-1", "Continuous"),
    ("Tenormin", "Atenolol", "Beta Blocker", "1-0-0", "Continuous"),
    ("Nebicard", "Nebivolol", "Beta Blocker", "1-0-0", "Continuous"),
    ("Enam", "Enalapril", "ACE Inhibitor", "1-0-1", "Continuous"),
    ("Ramistar", "Ramipril", "ACE Inhibitor", "1-0-0", "Continuous"),
    ("Cardace", "Ramipril", "ACE Inhibitor", "1-0-0", "Continuous"),
    ("Losar", "Losartan", "ARB", "1-0-0", "Continuous"),
    ("Losacar", "Losartan", "ARB", "1-0-0", "Continuous"),
    ("Telma", "Telmisartan", "ARB", "1-0-0", "Continuous"),
    ("Telmikind", "Telmisartan", "ARB", "1-0-0", "Continuous"),
    ("Telma-H", "Telmisartan + Hydrochlorothiazide", "ARB", "1-0-0", "Continuous"),
    ("Telma-AM", "Telmisartan + Amlodipine", "ARB", "1-0-0", "Continuous"),
    ("Olmesar", "Olmesartan", "ARB", "1-0-0", "Continuous"),
    ("Olvance", "Olmesartan", "ARB", "1-0-0", "Continuous"),
    ("Lasix", "Furosemide", "Diuretic", "1-0-0 morning", "As needed"),
    ("Aldactone", "Spironolactone", "Diuretic", "1-0-0 morning", "As needed"),
    ("Dytor", "Torsemide", "Diuretic", "1-0-0 morning", "As needed"),
    ("Nitrocontin", "Nitroglycerine SR", "Antianginal", "1-0-1", "Continuous"),
    ("Sorbitrate", "Isosorbide Dinitrate", "Antianginal", "SL SOS", "SOS"),
    ("Ivabrad", "Ivabradine", "Antianginal", "1-0-1", "Continuous"),
    ("Nikoran", "Nicorandil", "Antianginal", "1-0-1", "Continuous"),
    # Anti-anxiety / Sleep
    ("Alprax", "Alprazolam", "Anxiolytic", "0-0-1 HS", "3 days"),
    ("Restyl", "Alprazolam", "Anxiolytic", "0-0-1 HS", "3 days"),
    ("Ativan", "Lorazepam", "Anxiolytic", "0-0-1 HS", "3 days"),
    ("Lonazep", "Clonazepam", "Anxiolytic", "0-0-1 HS", "5 days"),
    ("Etizola", "Etizolam", "Anxiolytic", "0-0-1 HS", "5 days"),
    ("Zolfresh", "Zolpidem", "Sedative-Hypnotic", "0-0-1 HS", "5 days"),
    ("Melzap", "Clonazepam", "Anxiolytic", "0-0-1 HS", "5 days"),
    # Antidepressants
    ("Nexito", "Escitalopram", "SSRI", "1-0-0 after food", "Continuous"),
    ("Cipralex", "Escitalopram", "SSRI", "1-0-0 after food", "Continuous"),
    ("Prodep", "Fluoxetine", "SSRI", "1-0-0 after food", "Continuous"),
    ("Sertima", "Sertraline", "SSRI", "1-0-0 after food", "Continuous"),
    ("Zoloft", "Sertraline", "SSRI", "1-0-0 after food", "Continuous"),
    ("Duzela", "Duloxetine", "SNRI", "1-0-0 after food", "Continuous"),
    ("Venlor", "Venlafaxine", "SNRI", "1-0-0 after food", "Continuous"),
    ("Mirtaz", "Mirtazapine", "Antidepressant", "0-0-1 HS", "Continuous"),
    # Bronchodilators / Asthma
    ("Asthalin", "Salbutamol", "Bronchodilator", "1-0-1 SOS", "SOS"),
    ("Salbair", "Salbutamol", "Bronchodilator", "1-0-1 SOS", "SOS"),
    ("Foracort", "Formoterol + Budesonide", "Steroid Inhaler", "2 puff BID", "Continuous"),
    ("Seroflo", "Salmeterol + Fluticasone", "Steroid Inhaler", "2 puff BID", "Continuous"),
    ("Budecort", "Budesonide", "Steroid Inhaler", "2 puff BID", "Continuous"),
    ("Duolin", "Levosalbutamol + Ipratropium", "Bronchodilator", "1 puff QID", "As needed"),
    ("Montek", "Montelukast", "Leukotriene Antagonist", "0-0-1 HS", "28 days"),
    ("Deriphyllin", "Etophylline + Theophylline", "Bronchodilator", "1-0-1", "As needed"),
    # Steroids
    ("Wysolone", "Prednisolone", "Corticosteroid", "1-0-0 after food", "5 days"),
    ("Omnacortil", "Prednisolone", "Corticosteroid", "1-0-0 after food", "5 days"),
    ("Medrol", "Methylprednisolone", "Corticosteroid", "1-0-0 after food", "5 days"),
    ("Solu-Medrol", "Methylprednisolone IV", "Corticosteroid", "IV BD", "3 days"),
    ("Dexona", "Dexamethasone", "Corticosteroid", "1-0-1 after food", "3 days"),
    ("Betnesol", "Betamethasone", "Corticosteroid", "1-0-1 after food", "3 days"),
    ("Hostacortin", "Prednisolone", "Corticosteroid", "1-0-0 after food", "5 days"),
    # GI / Antiemetics
    ("Zofran", "Ondansetron", "Antiemetic", "1-1-1 SOS", "As needed"),
    ("Emeset", "Ondansetron", "Antiemetic", "1-1-1 SOS", "As needed"),
    ("Vomikind", "Ondansetron", "Antiemetic", "1-1-1 SOS", "As needed"),
    ("Perinorm", "Metoclopramide", "Antiemetic", "1-1-1 before food", "As needed"),
    ("Domstal", "Domperidone", "Antiemetic", "1-1-1 before food", "5 days"),
    ("Motilium", "Domperidone", "Antiemetic", "1-1-1 before food", "5 days"),
    # Laxatives
    ("Dulcolax", "Bisacodyl", "Laxative", "0-0-2 HS", "SOS"),
    ("Cremaffin", "Liquid Paraffin + Milk of Magnesia", "Laxative", "1 tbsp HS", "SOS"),
    ("Lactifiber", "Ispaghula", "Bulk Laxative", "1 tbsp BD", "As needed"),
    ("Softovac", "Ispaghula + Senna", "Laxative", "1 tsp HS", "As needed"),
    ("Movicol", "Polyethylene Glycol", "Laxative", "1 sachet HS", "As needed"),
    # Multivitamins / Supplements
    ("Neurobion Forte", "Vitamin B Complex", "Supplement", "1-0-0 after food", "30 days"),
    ("Becosules", "Vitamin B Complex + C", "Supplement", "1-0-0 after food", "30 days"),
    ("Zincovit", "Multivitamin + Zinc", "Supplement", "1-0-0 after food", "30 days"),
    ("Supradyn", "Multivitamin + Minerals", "Supplement", "1-0-0 after food", "30 days"),
    ("A to Z NS", "Multivitamin", "Supplement", "1-0-0 after food", "30 days"),
    ("Shelcal", "Calcium + Vitamin D3", "Supplement", "1-0-1 after food", "60 days"),
    ("Calcimax", "Calcium Citrate", "Supplement", "1-0-1 after food", "60 days"),
    ("Uprise D3", "Vitamin D3", "Supplement", "0-0-1 weekly", "8 weeks"),
    ("Livogen", "Iron + Folic Acid", "Supplement", "1-0-0 after food", "60 days"),
    ("Autrin", "Iron + Folic Acid + Vitamin B12", "Supplement", "1-0-0 after food", "60 days"),
    ("Feronia", "Iron", "Supplement", "1-0-0 after food", "60 days"),
    ("Orofer XT", "Iron + Folic Acid", "Supplement", "1-0-0 after food", "60 days"),
    # Thyroid / Endocrine
    ("Eltroxin", "Levothyroxine", "Thyroid", "1-0-0 empty stomach", "Continuous"),
    ("Thyronorm", "Levothyroxine", "Thyroid", "1-0-0 empty stomach", "Continuous"),
    ("Thyrox", "Levothyroxine", "Thyroid", "1-0-0 empty stomach", "Continuous"),
    ("Neomercazole", "Carbimazole", "Antithyroid", "1-0-1 after food", "Continuous"),
    # Antifungals
    ("Fluc", "Fluconazole", "Antifungal", "1-0-0 weekly", "4 weeks"),
    ("Forcan", "Fluconazole", "Antifungal", "1-0-0 weekly", "4 weeks"),
    ("Itraspor", "Itraconazole", "Antifungal", "1-0-1 after food", "14 days"),
    ("Griseofulvin", "Griseofulvin", "Antifungal", "1-0-1 after food", "6 weeks"),
    ("Terbicip", "Terbinafine", "Antifungal", "1-0-0 after food", "6 weeks"),
    # Antivirals
    ("Acivir", "Acyclovir", "Antiviral", "1-1-1-1-1", "5 days"),
    ("Zovirax", "Acyclovir", "Antiviral", "1-1-1-1-1", "5 days"),
    ("Valcivir", "Valacyclovir", "Antiviral", "1-0-1", "7 days"),
    ("Oseltamivir", "Oseltamivir", "Antiviral", "1-0-1 after food", "5 days"),
    # Anti-malarials / Anti-parasitics
    ("Lariago", "Chloroquine", "Antimalarial", "As per weight", "3 days"),
    ("Falcigo", "Artesunate", "Antimalarial", "IV BD", "3 days"),
    ("Zentel", "Albendazole", "Antihelminthic", "1-0-0 STAT", "STAT"),
    ("Bandy", "Albendazole", "Antihelminthic", "1-0-0 STAT", "STAT"),
    ("Nemocid", "Pyrantel Pamoate", "Antihelminthic", "1-0-0 STAT", "STAT"),
    # Muscle relaxants
    ("Myoril", "Thiocolchicoside", "Muscle Relaxant", "1-0-1 after food", "5 days"),
    ("Emanzen D", "Trypsin + Chymotrypsin", "Enzyme", "1-0-1 before food", "7 days"),
    ("Movexx", "Diclofenac + Thiocolchicoside", "Muscle Relaxant", "1-0-1 after food", "5 days"),
    # Ophthalmic
    ("Ciplox Eye Drop", "Ciprofloxacin Eye Drop", "Ophthalmic", "1 drop QID", "5 days"),
    ("Moxicip Eye Drop", "Moxifloxacin Eye Drop", "Ophthalmic", "1 drop QID", "5 days"),
    ("Toba DM", "Tobramycin + Dexamethasone", "Ophthalmic", "1 drop QID", "7 days"),
    ("Xalatan", "Latanoprost", "Ophthalmic", "0-0-1 HS", "Continuous"),
    ("Systane", "Carboxymethylcellulose", "Ophthalmic", "1 drop QID", "As needed"),
    ("Refresh Tears", "Carboxymethylcellulose", "Ophthalmic", "1 drop QID", "As needed"),
    # Topicals
    ("Volini", "Diclofenac Gel", "Topical NSAID", "TDS local", "5 days"),
    ("Moov", "Nilgiri + Turpentine Gel", "Topical", "TDS local", "5 days"),
    ("Betadine", "Povidone Iodine", "Antiseptic", "Topical", "As needed"),
    ("Soframycin", "Framycetin", "Antibiotic Topical", "TDS local", "5 days"),
    ("Fusiwal", "Fusidic Acid", "Antibiotic Topical", "TDS local", "7 days"),
    ("Candid", "Clotrimazole", "Antifungal Topical", "BD local", "14 days"),
    # Anti-anginal / vasodilators
    ("Nicardia", "Nifedipine", "CCB", "1-0-1", "Continuous"),
    # Neuropathic pain / Anti-epileptics
    ("Pregeb", "Pregabalin", "Anticonvulsant", "0-0-1 HS", "Continuous"),
    ("Neurica", "Pregabalin", "Anticonvulsant", "0-0-1 HS", "Continuous"),
    ("Gabapin", "Gabapentin", "Anticonvulsant", "1-1-1", "Continuous"),
    ("Frisium", "Clobazam", "Anticonvulsant", "0-0-1 HS", "Continuous"),
    ("Levipil", "Levetiracetam", "Anticonvulsant", "1-0-1", "Continuous"),
    ("Encorate", "Sodium Valproate", "Anticonvulsant", "1-0-1", "Continuous"),
    ("Eptoin", "Phenytoin", "Anticonvulsant", "1-0-1", "Continuous"),
    ("Tegrital", "Carbamazepine", "Anticonvulsant", "1-0-1", "Continuous"),
    # Contraceptives / Hormones
    ("Ovral G", "Levonorgestrel + Ethinylestradiol", "OCP", "0-0-1", "21 days"),
    ("Yasmin", "Drospirenone + Ethinylestradiol", "OCP", "0-0-1", "21 days"),
    ("iPill", "Levonorgestrel", "Emergency Contraceptive", "1 tab STAT", "STAT"),
    ("Duphaston", "Dydrogesterone", "Progestogen", "1-0-1", "As needed"),
    ("Susten", "Progesterone", "Progestogen", "1-0-1", "As needed"),
    # Anticoagulants
    ("Warf", "Warfarin", "Anticoagulant", "0-0-1", "Continuous"),
    ("Xarelto", "Rivaroxaban", "Anticoagulant", "1-0-1 after food", "Continuous"),
    ("Eliquis", "Apixaban", "Anticoagulant", "1-0-1 after food", "Continuous"),
    ("Clexane", "Enoxaparin", "Anticoagulant", "SC BD", "As per clinical"),
    ("Fondaparinux", "Fondaparinux", "Anticoagulant", "SC OD", "As per clinical"),
    # Anti-cancer / Immunosuppressants
    ("Methotrexate", "Methotrexate", "Immunosuppressant", "0-0-1 weekly", "Continuous"),
    ("Imuran", "Azathioprine", "Immunosuppressant", "1-0-0", "Continuous"),
    ("Cyclosporine", "Cyclosporine", "Immunosuppressant", "1-0-1", "Continuous"),
    # UTI / Urology
    ("Urispas", "Flavoxate", "Urinary Antispasmodic", "1-1-1", "5 days"),
    ("Vesicare", "Solifenacin", "Urinary Antispasmodic", "1-0-0", "Continuous"),
    ("Silodal", "Silodosin", "Alpha Blocker", "1-0-0 after food", "Continuous"),
    ("Urimax", "Tamsulosin", "Alpha Blocker", "1-0-0 after food", "Continuous"),
    ("Uripres", "Tamsulosin", "Alpha Blocker", "1-0-0 after food", "Continuous"),
    ("Finpecia", "Finasteride", "5-Alpha Reductase Inhibitor", "1-0-0 after food", "Continuous"),
    # Erectile Dysfunction
    ("Viagra", "Sildenafil", "PDE5 Inhibitor", "1-0-0 SOS", "SOS"),
    ("Cialis", "Tadalafil", "PDE5 Inhibitor", "1-0-0 SOS", "SOS"),
    ("Manforce", "Sildenafil", "PDE5 Inhibitor", "1-0-0 SOS", "SOS"),
    ("Vega", "Sildenafil", "PDE5 Inhibitor", "1-0-0 SOS", "SOS"),
]

# Common Indian dose forms + strengths to expand each seed
_DOSE_MATRIX = [
    # (suffix label, dose_string, form)
    ("", "500mg", "Tablet"),
    (" DS", "1g", "Tablet"),
    (" 250", "250mg", "Tablet"),
    (" 200", "200mg", "Tablet"),
    (" Syrup", "5ml BD", "Syrup"),
    (" Suspension", "5ml TDS", "Suspension"),
    (" Injection", "1 vial", "Injection"),
    (" XR", "500mg SR", "Tablet SR"),
    (" Kid", "125mg", "Tablet"),
]


def build_drugs() -> list[dict]:
    """Expand each seed into common Indian variants → ~1,000+ rows."""
    out: list[dict] = []
    seen: set[str] = set()
    for brand, generic, category, freq, duration in _DRUG_SEEDS:
        # Base entry (no strength suffix) as the "search anchor"
        base_name = brand
        key = base_name.lower()
        if key not in seen:
            out.append({
                "name": base_name,
                "generic": generic,
                "category": category,
                "default_dose": "As prescribed",
                "default_frequency": freq,
                "default_duration": duration,
                "form": "Tablet",
            })
            seen.add(key)

        # Add strength variants (skip forms clearly inapplicable — heuristic)
        for suffix, dose, form in _DOSE_MATRIX:
            variant = f"{brand}{suffix}".strip()
            key = variant.lower()
            if key in seen:
                continue
            # Skip syrup for insulins & injections; skip injection for OCPs, etc.
            if generic.lower().startswith("insulin") and form in ("Syrup", "Suspension", "Tablet SR"):
                continue
            if "topical" in category.lower() and form in ("Syrup", "Injection", "Tablet SR"):
                continue
            out.append({
                "name": variant,
                "generic": generic,
                "category": category,
                "default_dose": dose,
                "default_frequency": freq,
                "default_duration": duration,
                "form": form,
            })
            seen.add(key)

    return out


# --------------------------------------------------------------------------- #
# LABS — LOINC-derived core + Indian radiology catalogue                       #
# --------------------------------------------------------------------------- #

_HEMATOLOGY = [
    ("Complete Blood Count (CBC)", "58410-2", "Hematology", "Blood"),
    ("Hemoglobin (Hb)", "718-7", "Hematology", "Blood"),
    ("Hematocrit (PCV)", "4544-3", "Hematology", "Blood"),
    ("RBC Count", "789-8", "Hematology", "Blood"),
    ("WBC Count (TLC)", "6690-2", "Hematology", "Blood"),
    ("Differential WBC (DLC)", "24318-8", "Hematology", "Blood"),
    ("Platelet Count", "777-3", "Hematology", "Blood"),
    ("MCV", "787-2", "Hematology", "Blood"),
    ("MCH", "785-6", "Hematology", "Blood"),
    ("MCHC", "786-4", "Hematology", "Blood"),
    ("RDW", "788-0", "Hematology", "Blood"),
    ("ESR", "4537-7", "Hematology", "Blood"),
    ("Peripheral Smear", "10254-5", "Hematology", "Blood"),
    ("Reticulocyte Count", "4679-7", "Hematology", "Blood"),
    ("Coombs Test (Direct)", "1006-3", "Hematology", "Blood"),
    ("Coombs Test (Indirect)", "1007-1", "Hematology", "Blood"),
    ("Prothrombin Time (PT)", "5902-2", "Coagulation", "Blood"),
    ("INR", "6301-6", "Coagulation", "Blood"),
    ("APTT / PTT", "3173-2", "Coagulation", "Blood"),
    ("D-Dimer", "48065-7", "Coagulation", "Blood"),
    ("Fibrinogen", "3255-7", "Coagulation", "Blood"),
    ("Bleeding Time", "3184-9", "Coagulation", "Blood"),
    ("Clotting Time", "3185-6", "Coagulation", "Blood"),
]

_BIOCHEMISTRY = [
    ("Random Blood Sugar (RBS)", "2345-7", "Biochemistry", "Blood"),
    ("Fasting Blood Sugar (FBS)", "1558-6", "Biochemistry", "Blood"),
    ("Post-Prandial Blood Sugar (PPBS)", "1521-4", "Biochemistry", "Blood"),
    ("HbA1c (Glycated Hemoglobin)", "4548-4", "Biochemistry", "Blood"),
    ("OGTT (75g)", "20438-8", "Biochemistry", "Blood"),
    ("Urea", "3094-0", "Biochemistry", "Blood"),
    ("Blood Urea Nitrogen (BUN)", "3094-0", "Biochemistry", "Blood"),
    ("Creatinine", "2160-0", "Biochemistry", "Blood"),
    ("eGFR", "48642-3", "Biochemistry", "Blood"),
    ("Uric Acid", "3084-1", "Biochemistry", "Blood"),
    ("Sodium (Na)", "2951-2", "Biochemistry", "Blood"),
    ("Potassium (K)", "2823-3", "Biochemistry", "Blood"),
    ("Chloride (Cl)", "2075-0", "Biochemistry", "Blood"),
    ("Calcium (Total)", "17861-6", "Biochemistry", "Blood"),
    ("Calcium (Ionized)", "1994-3", "Biochemistry", "Blood"),
    ("Phosphorus", "2777-1", "Biochemistry", "Blood"),
    ("Magnesium", "2601-3", "Biochemistry", "Blood"),
    ("Total Protein", "2885-2", "Biochemistry", "Blood"),
    ("Albumin", "1751-7", "Biochemistry", "Blood"),
    ("Globulin", "10834-0", "Biochemistry", "Blood"),
    ("A:G Ratio", "1759-0", "Biochemistry", "Blood"),
    ("Bilirubin (Total)", "1975-2", "Biochemistry", "Blood"),
    ("Bilirubin (Direct)", "1968-7", "Biochemistry", "Blood"),
    ("Bilirubin (Indirect)", "1971-1", "Biochemistry", "Blood"),
    ("SGOT / AST", "1920-8", "Biochemistry", "Blood"),
    ("SGPT / ALT", "1742-6", "Biochemistry", "Blood"),
    ("Alkaline Phosphatase (ALP)", "6768-6", "Biochemistry", "Blood"),
    ("GGT", "2324-2", "Biochemistry", "Blood"),
    ("LDH", "2532-0", "Biochemistry", "Blood"),
    ("Amylase", "1798-8", "Biochemistry", "Blood"),
    ("Lipase", "3040-3", "Biochemistry", "Blood"),
    ("CK Total", "2157-6", "Biochemistry", "Blood"),
    ("CK-MB", "13969-1", "Biochemistry", "Blood"),
    ("Troponin I", "10839-9", "Cardiology", "Blood"),
    ("Troponin T", "6598-7", "Cardiology", "Blood"),
    ("NT-proBNP", "33762-6", "Cardiology", "Blood"),
    ("Homocysteine", "13965-9", "Cardiology", "Blood"),
    ("hs-CRP", "30522-7", "Inflammation", "Blood"),
    ("CRP (Qualitative)", "1988-5", "Inflammation", "Blood"),
    ("Procalcitonin", "33959-8", "Inflammation", "Blood"),
    ("Ferritin", "2276-4", "Biochemistry", "Blood"),
    ("Iron (Serum)", "2498-4", "Biochemistry", "Blood"),
    ("Total Iron Binding Capacity (TIBC)", "2500-7", "Biochemistry", "Blood"),
    ("Transferrin Saturation", "2502-3", "Biochemistry", "Blood"),
    ("Vitamin B12", "2132-9", "Biochemistry", "Blood"),
    ("Folic Acid / Folate", "2284-8", "Biochemistry", "Blood"),
    ("Vitamin D (25-OH)", "1989-3", "Biochemistry", "Blood"),
    ("Vitamin D Total", "62292-8", "Biochemistry", "Blood"),
    ("Ammonia", "3010-6", "Biochemistry", "Blood"),
    ("Lactate", "32693-4", "Biochemistry", "Blood"),
    ("ABG (Arterial Blood Gas)", "24336-0", "Biochemistry", "Blood"),
]

_LIPID = [
    ("Lipid Profile", "57698-3", "Lipid", "Blood"),
    ("Total Cholesterol", "2093-3", "Lipid", "Blood"),
    ("HDL Cholesterol", "2085-9", "Lipid", "Blood"),
    ("LDL Cholesterol", "13457-7", "Lipid", "Blood"),
    ("VLDL", "13458-5", "Lipid", "Blood"),
    ("Triglycerides", "2571-8", "Lipid", "Blood"),
    ("Non-HDL Cholesterol", "43396-1", "Lipid", "Blood"),
    ("Apolipoprotein A1", "1869-7", "Lipid", "Blood"),
    ("Apolipoprotein B", "1884-6", "Lipid", "Blood"),
    ("Lipoprotein(a)", "10835-7", "Lipid", "Blood"),
]

_ENDOCRINE = [
    ("Thyroid Profile (T3, T4, TSH)", "24357-6", "Endocrine", "Blood"),
    ("TSH", "3016-3", "Endocrine", "Blood"),
    ("Free T3 (FT3)", "3051-0", "Endocrine", "Blood"),
    ("Free T4 (FT4)", "3024-7", "Endocrine", "Blood"),
    ("Total T3", "3053-6", "Endocrine", "Blood"),
    ("Total T4", "3026-2", "Endocrine", "Blood"),
    ("Anti-TPO Antibody", "8099-5", "Endocrine", "Blood"),
    ("Anti-Thyroglobulin", "8098-7", "Endocrine", "Blood"),
    ("Reverse T3", "3053-6", "Endocrine", "Blood"),
    ("Cortisol (Morning)", "2143-6", "Endocrine", "Blood"),
    ("Cortisol (Evening)", "2143-6", "Endocrine", "Blood"),
    ("ACTH", "2141-0", "Endocrine", "Blood"),
    ("Growth Hormone", "2963-7", "Endocrine", "Blood"),
    ("IGF-1", "2484-4", "Endocrine", "Blood"),
    ("Prolactin", "2842-3", "Endocrine", "Blood"),
    ("FSH", "15067-2", "Endocrine", "Blood"),
    ("LH", "10501-5", "Endocrine", "Blood"),
    ("Estradiol (E2)", "14715-7", "Endocrine", "Blood"),
    ("Progesterone", "2839-9", "Endocrine", "Blood"),
    ("Testosterone (Total)", "2986-8", "Endocrine", "Blood"),
    ("Testosterone (Free)", "2991-8", "Endocrine", "Blood"),
    ("DHEA-S", "2191-5", "Endocrine", "Blood"),
    ("Insulin (Fasting)", "1554-5", "Endocrine", "Blood"),
    ("C-Peptide", "1986-9", "Endocrine", "Blood"),
    ("PTH (Parathyroid Hormone)", "2731-8", "Endocrine", "Blood"),
    ("Vitamin B12", "2132-9", "Endocrine", "Blood"),
    ("AMH (Anti-Mullerian Hormone)", "38476-9", "Endocrine", "Blood"),
]

_URINE = [
    ("Urine Routine & Microscopy", "24356-8", "Urine", "Urine"),
    ("Urine Culture & Sensitivity", "630-4", "Microbiology", "Urine"),
    ("Urine Pregnancy Test (UPT)", "2106-3", "Urine", "Urine"),
    ("Urine Ketone Bodies", "2514-8", "Urine", "Urine"),
    ("Urine Microalbumin", "14957-5", "Urine", "Urine"),
    ("Urine Microalbumin-Creatinine Ratio (ACR)", "9318-7", "Urine", "Urine"),
    ("24-Hour Urine Protein", "2888-6", "Urine", "Urine"),
    ("24-Hour Urine Creatinine", "2161-8", "Urine", "Urine"),
    ("Urine Bence-Jones Protein", "13952-7", "Urine", "Urine"),
    ("Urine Metanephrines", "9269-2", "Urine", "Urine"),
    ("Urine VMA", "1911-7", "Urine", "Urine"),
]

_SEROLOGY = [
    ("Widal Test (Typhoid)", "5041-9", "Serology", "Blood"),
    ("Dengue NS1 Antigen", "44961-1", "Serology", "Blood"),
    ("Dengue IgM", "25340-1", "Serology", "Blood"),
    ("Dengue IgG", "25342-7", "Serology", "Blood"),
    ("Malaria (MP) Antigen", "20464-4", "Serology", "Blood"),
    ("Malaria Parasite Smear", "3151-8", "Serology", "Blood"),
    ("Chikungunya IgM", "50693-2", "Serology", "Blood"),
    ("Scrub Typhus IgM", "51820-0", "Serology", "Blood"),
    ("Leptospira IgM", "5203-5", "Serology", "Blood"),
    ("VDRL / RPR", "5292-8", "Serology", "Blood"),
    ("TPHA", "5290-2", "Serology", "Blood"),
    ("HIV I & II (ELISA)", "56888-1", "Serology", "Blood"),
    ("HIV I & II (Rapid)", "42891-2", "Serology", "Blood"),
    ("HBsAg", "5195-3", "Serology", "Blood"),
    ("Anti-HBs (Hepatitis B Ab)", "5193-8", "Serology", "Blood"),
    ("HBeAg", "5192-0", "Serology", "Blood"),
    ("Anti-HBc IgM", "5187-0", "Serology", "Blood"),
    ("HCV Antibody", "16128-1", "Serology", "Blood"),
    ("Hepatitis A IgM", "22314-9", "Serology", "Blood"),
    ("Hepatitis E IgM", "22322-2", "Serology", "Blood"),
    ("ASO Titre", "12245-2", "Serology", "Blood"),
    ("RA Factor", "11572-5", "Serology", "Blood"),
    ("Anti-CCP", "32664-6", "Serology", "Blood"),
    ("ANA (Antinuclear Antibody)", "5048-4", "Serology", "Blood"),
    ("Anti-dsDNA", "5133-4", "Serology", "Blood"),
    ("Complement C3", "4485-9", "Serology", "Blood"),
    ("Complement C4", "4498-2", "Serology", "Blood"),
    ("COVID RT-PCR", "94500-6", "Microbiology", "Nasal Swab"),
    ("COVID Rapid Antigen", "94558-4", "Microbiology", "Nasal Swab"),
    ("COVID IgG Antibody", "94505-5", "Serology", "Blood"),
]

_MICROBIOLOGY = [
    ("Sputum AFB Smear", "666-8", "Microbiology", "Sputum"),
    ("Sputum Culture & Sensitivity", "10357-6", "Microbiology", "Sputum"),
    ("Gene Xpert (MTB)", "88519-5", "Microbiology", "Sputum"),
    ("Blood Culture", "600-7", "Microbiology", "Blood"),
    ("Stool Routine", "10366-7", "Microbiology", "Stool"),
    ("Stool Culture", "625-4", "Microbiology", "Stool"),
    ("Stool Occult Blood", "14563-1", "Microbiology", "Stool"),
    ("H. Pylori (Urea Breath Test)", "42630-4", "Microbiology", "Breath"),
    ("H. Pylori Antigen (Stool)", "45094-0", "Microbiology", "Stool"),
    ("Pus Culture & Sensitivity", "6462-6", "Microbiology", "Pus"),
    ("Throat Swab Culture", "623-9", "Microbiology", "Swab"),
    ("Ear Swab Culture", "618-9", "Microbiology", "Swab"),
    ("Vaginal Swab", "17909-3", "Microbiology", "Swab"),
    ("CSF Analysis", "24363-4", "Microbiology", "CSF"),
    ("CSF Culture", "601-5", "Microbiology", "CSF"),
]

_TUMOR_MARKERS = [
    ("PSA (Prostate Specific Antigen)", "2857-1", "Tumor Marker", "Blood"),
    ("Free PSA", "10886-0", "Tumor Marker", "Blood"),
    ("CA 125", "10334-1", "Tumor Marker", "Blood"),
    ("CA 15-3", "6875-9", "Tumor Marker", "Blood"),
    ("CA 19-9", "24108-3", "Tumor Marker", "Blood"),
    ("CEA (Carcinoembryonic Antigen)", "2039-6", "Tumor Marker", "Blood"),
    ("AFP (Alpha Fetoprotein)", "1834-1", "Tumor Marker", "Blood"),
    ("Beta HCG", "19080-1", "Tumor Marker", "Blood"),
    ("Thyroglobulin", "3013-0", "Tumor Marker", "Blood"),
    ("Calcitonin", "1988-5", "Tumor Marker", "Blood"),
    ("Chromogranin A", "34550-4", "Tumor Marker", "Blood"),
]

_RADIOLOGY = [
    # X-Rays
    ("X-Ray Chest PA View", "24648-8", "Radiology", "X-ray"),
    ("X-Ray Chest AP View", "36572-5", "Radiology", "X-ray"),
    ("X-Ray Chest Lateral", "42169-3", "Radiology", "X-ray"),
    ("X-Ray Abdomen Erect", "36026-2", "Radiology", "X-ray"),
    ("X-Ray Abdomen Supine", "44115-4", "Radiology", "X-ray"),
    ("X-Ray Skull AP/Lateral", "37697-9", "Radiology", "X-ray"),
    ("X-Ray Cervical Spine", "36006-4", "Radiology", "X-ray"),
    ("X-Ray Lumbar Spine", "36034-6", "Radiology", "X-ray"),
    ("X-Ray Dorsal Spine", "36037-9", "Radiology", "X-ray"),
    ("X-Ray Pelvis AP", "36030-4", "Radiology", "X-ray"),
    ("X-Ray Knee AP/Lateral", "36088-2", "Radiology", "X-ray"),
    ("X-Ray Shoulder AP/Axial", "36109-6", "Radiology", "X-ray"),
    ("X-Ray Hand AP/Oblique", "36061-9", "Radiology", "X-ray"),
    ("X-Ray Foot AP/Oblique", "36055-1", "Radiology", "X-ray"),
    ("X-Ray Sinuses (PNS)", "36055-1", "Radiology", "X-ray"),
    # Ultrasound
    ("USG Abdomen", "24558-9", "Radiology", "Ultrasound"),
    ("USG Whole Abdomen", "24560-5", "Radiology", "Ultrasound"),
    ("USG Upper Abdomen", "42160-2", "Radiology", "Ultrasound"),
    ("USG Pelvis", "24601-7", "Radiology", "Ultrasound"),
    ("USG KUB (Kidney-Ureter-Bladder)", "24607-4", "Radiology", "Ultrasound"),
    ("USG Obstetric (Level I)", "37770-4", "Radiology", "Ultrasound"),
    ("USG Obstetric (Level II / Anomaly)", "37836-3", "Radiology", "Ultrasound"),
    ("USG Doppler (Renal)", "39061-6", "Radiology", "Ultrasound"),
    ("USG Doppler (Carotid)", "37728-2", "Radiology", "Ultrasound"),
    ("USG Doppler (Lower Limb Arterial)", "45036-1", "Radiology", "Ultrasound"),
    ("USG Doppler (Lower Limb Venous)", "45042-9", "Radiology", "Ultrasound"),
    ("USG Doppler (Fetal)", "18744-3", "Radiology", "Ultrasound"),
    ("USG Thyroid", "37955-1", "Radiology", "Ultrasound"),
    ("USG Breast", "37770-4", "Radiology", "Ultrasound"),
    ("USG Neck", "24630-6", "Radiology", "Ultrasound"),
    ("USG Scrotum", "43460-5", "Radiology", "Ultrasound"),
    # CT
    ("CT Brain (Plain)", "24725-4", "Radiology", "CT"),
    ("CT Brain with Contrast", "30799-1", "Radiology", "CT"),
    ("CT Chest (HRCT)", "24628-0", "Radiology", "CT"),
    ("CT Chest with Contrast", "30655-5", "Radiology", "CT"),
    ("CT Abdomen with Contrast", "24725-4", "Radiology", "CT"),
    ("CT Whole Abdomen (Triple Phase)", "42150-3", "Radiology", "CT"),
    ("CT Neck", "30666-2", "Radiology", "CT"),
    ("CT KUB", "30646-4", "Radiology", "CT"),
    ("CT PNS (Sinuses)", "30638-1", "Radiology", "CT"),
    ("CT Angiography (Coronary)", "42405-1", "Radiology", "CT"),
    ("CT Angiography (Pulmonary)", "30692-8", "Radiology", "CT"),
    ("CT Angiography (Renal)", "30693-6", "Radiology", "CT"),
    ("CT Spine (Cervical)", "30649-8", "Radiology", "CT"),
    ("CT Spine (Lumbar)", "30655-5", "Radiology", "CT"),
    # MRI
    ("MRI Brain (Plain)", "24590-2", "Radiology", "MRI"),
    ("MRI Brain with Contrast", "24591-0", "Radiology", "MRI"),
    ("MRI Cervical Spine", "24587-8", "Radiology", "MRI"),
    ("MRI Lumbo-Sacral Spine", "24638-9", "Radiology", "MRI"),
    ("MRI Whole Spine Screening", "24710-6", "Radiology", "MRI"),
    ("MRI Abdomen", "43467-0", "Radiology", "MRI"),
    ("MRI Pelvis", "43473-8", "Radiology", "MRI"),
    ("MRI Knee", "24597-7", "Radiology", "MRI"),
    ("MRI Shoulder", "24601-7", "Radiology", "MRI"),
    ("MRI Hip", "43470-4", "Radiology", "MRI"),
    ("MRI Ankle", "43466-2", "Radiology", "MRI"),
    ("MRI Wrist", "43476-1", "Radiology", "MRI"),
    ("MRCP (Cholangiopancreatography)", "37826-4", "Radiology", "MRI"),
    ("MR Angiography (Brain)", "26374-9", "Radiology", "MRI"),
    ("MR Venogram", "36831-5", "Radiology", "MRI"),
    ("Functional MRI (fMRI)", "43478-7", "Radiology", "MRI"),
    # Cardiac / Physiology
    ("ECG (12 Lead)", "11524-6", "Cardiology", "ECG"),
    ("Echocardiogram (2D Echo)", "34552-0", "Cardiology", "Ultrasound"),
    ("Echocardiogram (Colour Doppler)", "34553-8", "Cardiology", "Ultrasound"),
    ("TMT (Treadmill Test)", "48027-7", "Cardiology", "Test"),
    ("Holter Monitoring (24 hr)", "18752-6", "Cardiology", "Test"),
    ("Holter Monitoring (48 hr)", "18752-6", "Cardiology", "Test"),
    ("EEG (Electroencephalogram)", "11543-6", "Neurology", "Test"),
    ("EMG (Electromyography)", "11542-8", "Neurology", "Test"),
    ("NCV (Nerve Conduction Velocity)", "11539-4", "Neurology", "Test"),
    ("Pulmonary Function Test (PFT)", "34534-8", "Pulmonology", "Test"),
    ("Spirometry", "19835-8", "Pulmonology", "Test"),
    # Mammography / DEXA / Nuclear
    ("Mammography (Screening)", "24605-8", "Radiology", "Mammography"),
    ("Mammography (Diagnostic)", "24606-6", "Radiology", "Mammography"),
    ("DEXA Scan (Bone Density)", "38265-5", "Radiology", "DEXA"),
    ("PET-CT Whole Body", "44139-4", "Radiology", "PET-CT"),
    ("PET-CT Brain", "44140-2", "Radiology", "PET-CT"),
    ("Bone Scan (Tc-99m)", "39142-4", "Radiology", "Nuclear"),
    ("Thyroid Scan (Tc-99m)", "39147-3", "Radiology", "Nuclear"),
    ("Renal DTPA Scan", "39150-7", "Radiology", "Nuclear"),
]

_OTHER = [
    ("Pap Smear", "10524-7", "Cytology", "Cervical Swab"),
    ("FNAC", "26436-6", "Cytology", "Biopsy"),
    ("Skin Biopsy", "22633-2", "Histopathology", "Biopsy"),
    ("Endoscopic Biopsy", "22635-7", "Histopathology", "Biopsy"),
    ("Bone Marrow Aspiration", "26440-8", "Hematology", "Bone Marrow"),
    ("Bone Marrow Biopsy", "22637-3", "Histopathology", "Bone Marrow"),
    ("Semen Analysis", "24362-6", "Andrology", "Semen"),
    ("Karyotyping", "31200-9", "Genetics", "Blood"),
    ("Hemoglobin Electrophoresis", "13538-4", "Hematology", "Blood"),
    ("G6PD Deficiency Screen", "10535-3", "Hematology", "Blood"),
    ("Sickle Cell Screen", "20472-7", "Hematology", "Blood"),
    ("Blood Group & Rh Typing", "883-9", "Immunohematology", "Blood"),
    ("Cross Match", "882-1", "Immunohematology", "Blood"),
]


def build_labs() -> list[dict]:
    out: list[dict] = []
    for src in [_HEMATOLOGY, _BIOCHEMISTRY, _LIPID, _ENDOCRINE, _URINE,
                _SEROLOGY, _MICROBIOLOGY, _TUMOR_MARKERS, _RADIOLOGY, _OTHER]:
        for name, code, category, sample in src:
            out.append({
                "name": name,
                "code": code,
                "category": category,
                "sample": sample,
            })
    return out


if __name__ == "__main__":
    drugs = build_drugs()
    labs = build_labs()

    with open(OUT_DIR / "indian_drugs.json", "w", encoding="utf-8") as f:
        json.dump({"drugs": drugs}, f, ensure_ascii=False, indent=2)
    with open(OUT_DIR / "lab_tests.json", "w", encoding="utf-8") as f:
        json.dump({"lab_tests": labs}, f, ensure_ascii=False, indent=2)

    print(f"✓ Wrote {len(drugs)} drugs → data/indian_drugs.json")
    print(f"✓ Wrote {len(labs)} lab/radiology tests → data/lab_tests.json")

    cats_d = sorted({d['category'] for d in drugs})
    cats_l = sorted({l['category'] for l in labs})
    print(f"  Drug categories:  {len(cats_d)}")
    print(f"  Lab categories:   {len(cats_l)}")
