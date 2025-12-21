from pypdf import PdfReader
print("pypdf available")
reader = PdfReader("doc/Proposal.pdf")
for i in range(min(3, len(reader.pages))):
    print(f"--- PAGE {i} ---")
    print(reader.pages[i].extract_text())
