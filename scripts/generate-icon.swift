import AppKit
let size = 1024
let image = NSImage(size: NSSize(width:size,height:size))
image.lockFocus()
NSColor(calibratedRed:0.05,green:0.11,blue:0.13,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:32,y:32,width:960,height:960),xRadius:220,yRadius:220).fill()
let ring=NSBezierPath(ovalIn:NSRect(x:220,y:220,width:584,height:584))
NSColor(calibratedRed:0.28,green:0.84,blue:0.71,alpha:1).setStroke();ring.lineWidth=45;ring.stroke()
NSColor(calibratedRed:0.65,green:0.95,blue:0.87,alpha:1).setFill()
for (i,h) in [150,300,220].enumerated(){NSBezierPath(roundedRect:NSRect(x:350+i*120,y:360,width:70,height:h),xRadius:22,yRadius:22).fill()}
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
