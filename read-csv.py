import csv
import json

# ลอง encoding หลายแบบ
encodings = ['utf-8-sig', 'utf-8', 'tis-620', 'windows-874', 'cp874']

for enc in encodings:
    try:
        print(f"\n=== Trying {enc} ===")
        with open(r'C:\Users\User\Downloads\Copy of สถิติกักบริเวณ - เวรเตรียมการณ์ ร้อย 4.csv', 'r', encoding=enc) as f:
            reader = csv.reader(f)
            rows = list(reader)

            # แสดง 10 แถวแรก
            for i, row in enumerate(rows[:10], 1):
                print(f"Row {i}: {row[:6]}")  # แสดงแค่ 6 คอลัมน์แรก

            # ถ้าอ่านได้และมีภาษาไทยถูกต้อง ให้สกัดข้อมูลนักเรียน
            if len(rows) > 1 and 'ชื่อ' in str(rows[0]):
                students = []
                for row in rows[1:]:
                    if len(row) >= 5 and row[1] and row[2] and row[4]:  # ถ้ามีชื่อ นามสกุล และเลขที่
                        student = {
                            'name': row[1].strip(),
                            'surname': row[2].strip(),
                            'number': row[4].strip(),
                            'full_name': f"นรต.{row[1].strip()} {row[2].strip()} {row[4].strip()}"
                        }
                        students.append(student)

                print(f"\n\nFound {len(students)} students")
                print("First 5 students:")
                for s in students[:5]:
                    print(f"  {s['full_name']}")

                # บันทึกเป็น JSON
                with open('students-data.json', 'w', encoding='utf-8') as f:
                    json.dump(students, f, ensure_ascii=False, indent=2)
                print(f"\nSaved to students-data.json")
                break

    except Exception as e:
        print(f"Error with {enc}: {e}")
