/// Triangles filling a simple polygon (ear clipping): indices into `ring`, wound counter-clockwise
/// seen from above (+Y). For building roofs, the sea, piers and pools. Rings of thousands of points
/// (Marina Bay's water) stay fast: the search resumes where the last ear was cut, and only the
/// reflex corners can lie inside an ear, so only they are tested.
public func triangulate(_ ring: [Vec2]) -> [Int] {
    var points = ring
    if points.count > 3, points.first == points.last { points.removeLast() }
    let n = points.count
    guard n >= 3 else { return [] }
    var area = 0.0
    for i in 0..<n {
        let a = points[i]
        let b = points[(i + 1) % n]
        area += a.x * b.z - b.x * a.z
    }
    // A doubly linked ring of the corners still to clip, in the winding the clipping expects.
    var next = (0..<n).map { (($0 + (area < 0 ? -1 : 1)) + n) % n }
    var prev = (0..<n).map { (($0 - (area < 0 ? -1 : 1)) + n) % n }
    func cross(_ a: Vec2, _ b: Vec2, _ c: Vec2) -> Double { (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) }
    func convex(_ i: Int) -> Bool { cross(points[prev[i]], points[i], points[next[i]]) > 0 }
    var reflex = Set((0..<n).filter { !convex($0) })
    func isEar(_ i: Int) -> Bool {
        guard convex(i) else { return false }
        let (a, b, c) = (points[prev[i]], points[i], points[next[i]])
        for j in reflex where j != prev[i] && j != next[i] && j != i {
            let p = points[j]
            if cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0 { return false }
        }
        return true
    }
    var triangles: [Int] = []
    triangles.reserveCapacity((n - 2) * 3)
    var remaining = n
    var i = 0
    var misses = 0
    while remaining > 3 {
        if isEar(i) {
            let (p, q) = (prev[i], next[i])
            triangles += [p, i, q]
            next[p] = q
            prev[q] = p
            reflex.remove(i)
            remaining -= 1
            for k in [p, q] where reflex.contains(k) && convex(k) { reflex.remove(k) }
            misses = 0
            i = p
        } else {
            misses += 1
            // A degenerate ring (a self-touching OSM outline): cut what is left as a fan.
            if misses > remaining { break }
            i = next[i]
        }
    }
    // The last triangle, or the fan of a degenerate rest.
    let start = i
    var a = next[start]
    while next[a] != start && remaining >= 3 {
        triangles += [start, a, next[a]]
        a = next[a]
    }
    // Clipping ran counter-clockwise seen from below (x–z ground); flip for above.
    var flipped: [Int] = []
    flipped.reserveCapacity(triangles.count)
    for t in stride(from: 0, to: triangles.count, by: 3) { flipped += [triangles[t], triangles[t + 2], triangles[t + 1]] }
    return flipped
}
