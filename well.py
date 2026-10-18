import pandas as pd
from datetime import datetime

# Load CSV
df = pd.read_csv("billboard.csv")

CURRENT_YEAR = datetime.now().year
CURRENT_2DIGIT = CURRENT_YEAR % 100

def fix_date(date_str):

    # Handle missing values
    if pd.isna(date_str):
        return pd.NaT

    try:
        day, month, year = date_str.split("-")
        year = int(year)

        # Decide century
        if year > CURRENT_2DIGIT:
            full_year = 1900 + year
        else:
            full_year = 2000 + year

        fixed_date = f"{day}-{month}-{full_year}"

        return pd.to_datetime(
            fixed_date,
            format="%d-%b-%Y"
        )

    except Exception:
        print(f"Error with date: {date_str}")
        return pd.NaT


# Convert date column
df["Date"] = df["Date"].apply(fix_date)

# FORMAT DATE
df["Date"] = df["Date"].dt.strftime("%d-%m-%Y")

# Save fixed file
output_path = r"C:\na dysk\Volleyball\billboard_fixed.csv"
df.to_csv(output_path, index=False)

print("Done!")
print("Saved to:")
print(output_path)

# Preview
print(df.head())