import csv
import random
from datetime import datetime, timedelta

rows = 200_000  # exceeds free tier

with open("large_test_dataset.csv", "w", newline="") as f:
    writer = csv.writer(f)

    writer.writerow([
        "id",
        "user_id",
        "amount",
        "created_at",
        "status"
    ])

    start = datetime(2023,1,1)

    for i in range(rows):
        writer.writerow([
            i,
            random.randint(1, 5000),
            round(random.uniform(5,500),2),
            start + timedelta(minutes=i),
            random.choice(["paid","pending","failed"])
        ])
