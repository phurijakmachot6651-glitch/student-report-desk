import openpyxl
import json

# อ่านไฟล์ Excel
workbook = openpyxl.load_workbook(r'C:\Users\User\Downloads\Copy of สถิติกักบริเวณ - เวรเตรียมการณ์ ร้อย 4.xlsx')
sheet = workbook.active

# แสดง 10 แถวแรกเพื่อดูโครงสร้าง
print("First 10 rows:")
for i, row in enumerate(sheet.iter_rows(values_only=True), 1):
    if i > 10:
        break
    print(f"Row {i}: {row}")

workbook.close()
