import re

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
    color_match = re.search(r'fill="([^"]+)"', path)
    if color_match:
        color = color_match.group(1)
        color_split = color[5:-1].split(",")
        color = list(int(c) for c in color_split)[:-1]
        color_data.append(color)

print(color_data[0])

# d="M530,700 L529,701 L526,701 L530,700"에서 좌표만 추출
coordinates = []
# colors = []

for d in path_data:
    d_split = d.split(" ")
    triangle = []
    for segment in d_split[:-1]:
        coords = segment[1:].split(",")  # M, L 등의 문자를 제거하고 좌표만 추출
        triangle.append((float(coords[0]), float(coords[1])))

    coordinates.append(triangle)

coord_tuple = tuple()

for coord in coordinates:
    for point in coord:
        coord_tuple += point

print(len(coord_tuple))