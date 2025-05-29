import re

with open("Girl_with_a_Pearl_Earring.svg") as f:
    svg_content = f.read()

# path요소들만 찾기
path_elements = re.findall(r"<path[^>]*>", svg_content)
# path요소에서 d 속성 추출
path_data = []

for path in path_elements:
    d_match = re.search(r'd="([^"]+)"', path)
    if d_match:
        path_data.append(d_match.group(1))

# d="M530,700 L529,701 L526,701 L530,700"에서 좌표만 추출
coordinates = []

for d in path_data:
    d_split = d.split(" ")
    triangle = []
    for segment in d_split[:-1]:
        coords = segment[1:].split(",")  # M, L 등의 문자를 제거하고 좌표만 추출
        triangle.append((float(coords[0]), float(coords[1])))

    coordinates.append(triangle)

print(path_data[0])
print(coordinates[0])
