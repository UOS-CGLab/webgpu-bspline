import re
import json

with open("Girl_with_a_Pearl_Earring.svg") as f:
    svg_content = f.read()

# path요소들만 찾기
path_elements = re.findall(r"<path[^>]*>", svg_content)
# path요소에서 d 속성 추출
path_data = []
color_data = []

for path in path_elements:
    d_match = re.search(r'd="([^"]+)"', path)
    if d_match:
        path_data.append(d_match.group(1))
    fill_match = re.search(r'fill="([^"]+)"', path)
    if fill_match:
        color_data.append(fill_match.group(1))

# d="M530,700 L529,701 L526,701 L530,700"에서 좌표만 추출
coordinates = []
colors = []

max_x = 0
max_y = 0

for d in path_data:
    d_split = d.split(" ")
    triangle = []
    for segment in d_split[:-1]:
        coords = segment[1:].split(",")  # M, L 등의 문자를 제거하고 좌표만 추출
        triangle.append((float(coords[0]), float(coords[1])))
        # coordinates.append(float(coords[0]), float(coords[1]))

    coordinates.append(triangle)
    max_x = max(max_x, max(coord[0] for coord in triangle))
    max_y = max(max_y, max(coord[1] for coord in triangle))

# 색상 데이터 추출
for color in color_data:
    color_str = color[5:-1].split(",")[:3]  # rgba에서 r, g, b 값만 추출
    color = tuple(int(c) for c in color_str)
    colors.append(color)

print(max_x, max_y)

# JSON으로 저장
data = {
    "coordinates": [],
    "colors": [],
    # "max_x": max_x,
    # "max_y": max_y,
}

def change_coord(triangle):
    offset_x = 400
    offset_y = 300
    scale = 0.25
    new_coord = []
    for i in range(3):
        x = triangle[i][0]
        y = triangle[i][1]
        x -= max_x / 2
        y -= max_y / 2
        x *= scale
        y *= scale
        x += offset_x
        y += offset_y
        
        new_coord.extend([x, y])
    return new_coord

for triangle in coordinates:
    data["coordinates"].extend(change_coord(triangle))

for color in colors:
    for i in range(3):
        data["colors"].append(color)

with open("svg_data.json", "w") as json_file:
    json.dump(data, json_file, indent=2)
