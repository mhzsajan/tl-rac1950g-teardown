import re
PAIRS = [
    ("All equipment", "All devices"),
    ("Equipment management", "Device management"),
    ("connected terminals", "connected devices"),
    ("connected terminal", "connected device"),
    ("Device system error!", "Some router data is unavailable."),
    ("forget the password", "Forgot password"),
    ("wireless timing", "Wireless schedule"),
    ("network management", "Network management"),
    ("Management router", "Manage router"),
    ("Unbound device", "Unbound devices"),
    ("Please enter administrator password", "Please enter the administrator password"),
    ("Equipment", "Devices"),
    ("terminals", "devices"),
]
FILES = ["work/res/values/strings.xml", "work/res/values/arrays.xml", "work/res/values/plurals.xml", "work/res/values-zh/strings.xml"]
for f in FILES:
    import os
    if not os.path.exists(f):
        continue
    t = open(f, encoding="utf-8").read()
    n0 = len(t)
    for a, b in PAIRS:
        if a == "main route":
            t = re.sub(r"main route(?!r)", "main router", t)
        else:
            t = t.replace(a, b)
    open(f, "w", encoding="utf-8").write(t)
    print(f, n0, "->", len(t))
