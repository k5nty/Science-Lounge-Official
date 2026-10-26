# №03. Robot Navigation in Harsh Environments

**Speaker:** Andrey Zubov, Letovo alumnus, digital projects manager at Rusagro, founder of an agritech startup, student at MIPT and the Skolkovo business school
**Date:** 13 March 2026, 16:30 · Letovo School, S02

> **Material on the lecture topic.** A popular-science retelling prepared from the lecture announcement on the Science Lounge website. This is not a transcript: the wording and lines are not the speaker's, and the speaker has not reviewed the text. No specific company projects are described.

---

## [00:00] Introduction: "Where am I?"

**Speaker:** Hi everyone! I'm really happy to be speaking at Letovo — I used to sit roughly where you're sitting now. So if you get bored, I'll understand.

*(Laughter.)*

Let's start with an experiment. Close your eyes. Everyone closed them? Now point to the door.

*(Pause.)*

Open them. Most of you pointed more or less correctly. How did you do it? You couldn't see the door. You *remembered* where it was, and you *knew* you hadn't moved since you sat down. Now imagine that, with your eyes closed, I spun you around on your chair ten times, then walked you down a corridor, and then asked you to point to the door. You probably wouldn't manage.

That's the core problem of robot navigation. A robot constantly has to answer three questions for itself:

[Slide: "Where am I? Where do I need to go? How do I get there?"]

1. **Where am I?** — this is the *localisation* problem.
2. **What does the world around me look like?** — this is the *mapping* problem.
3. **How do I reach the goal without hitting anything?** — this is *path planning*.

Today we'll talk mostly about the first question, because it's the trickiest. If a robot doesn't know where it is, the second and third questions stop making sense.

## [06:00] What is a "harsh environment"?

**Speaker:** The announcement said "a harsh, unstructured environment". What does that mean?

[Slide: photos — a dusty field, a mine, snowy taiga, a warehouse, the surface of Mars]

A *structured* environment is, for example, a city road. There are lane markings, signs, smooth asphalt, clear rules. Or a warehouse with markers stuck on the floor that robots follow. Here navigation is a relatively solved problem.

An *unstructured* environment is a field, a forest, a construction site, a mine, a disaster zone, the surface of another planet. No markings. No straight walls. Everything looks like everything else: one part of a field looks just like another.

And a *harsh* environment is one that also interferes with the sensors:
- **dust** clogs cameras and lidars;
- **mud and water** make wheels slip;
- **vibration** throws off inertial sensors;
- **temperature swings** make sensors drift;
- **metal structures** spoil compass readings;
- **no GPS** — underground, indoors, in forests, in mountains, or because of jamming.

I work a lot with agriculture, so many of my examples will come from there. A field is a very good "harsh environment": in summer the dust behind a combine harvester is so thick you can't see anything. In spring the mud is knee-deep. In autumn there's fog. And all of this over huge areas.

## [12:00] Why you can't just use GPS

**Question from the audience:** Why can't you just put GPS on it? It works on phones.

**Speaker:** Great question — let's start there. First, let's look at how satellite navigation actually works.

[Slide: diagram — satellites in orbit and a receiver on Earth]

GPS is the American system; there's also Russia's GLONASS, Europe's Galileo and China's BeiDou. Together they're called GNSS — global navigation satellite systems. They all work on the same principle.

Each satellite flies at an altitude of about twenty thousand kilometres and constantly transmits a signal: "I'm satellite number such-and-such, here are my coordinates, and the time right now is this." The satellite carries very precise atomic clocks on board. Your receiver picks up the signal and compares the time it was sent with the time it was received. The signal travels at the speed of light, so the time difference multiplied by the speed of light is the distance to the satellite.

If you know the distance to one satellite, you're somewhere on a sphere around it. To two — on the circle where the spheres intersect. To three — at one of two points. And you need a fourth satellite because the clock in your phone isn't atomic, so you also have to calculate its error.

Now let's estimate. Light travels 300 metres in one microsecond. A clock error of one *millionth* of a second — and you're off by three hundred metres! That's why such precise timing is needed. And that's why GPS is really a precise time system, and navigation is a consequence of it.

**Ordinary GPS accuracy** on a phone is a few metres. That's enough to find a café. For a tractor that has to drive exactly between rows of crops, it isn't. A one-metre error — and you've driven over the plants.

There's a way to improve accuracy — **RTK**, real-time kinematics. A base station with precisely known coordinates is set up nearby. It sees the same satellites, calculates the error and sends a correction to the robot. The accuracy becomes centimetre-level. In agriculture this is the standard today: tractor autopilots guide machinery to within a couple of centimetres.

**But** — and this is where it gets interesting — satellite navigation has fundamental weaknesses.

[Slide: "Why GNSS may not work"]

1. **The signal is very weak.** The satellite is far away and its transmitter isn't powerful. By the time the signal reaches the ground, it's weaker than the background noise. The receiver extracts it with clever maths.
2. **The signal doesn't pass through obstacles.** Underground, in a mine, in a tunnel, in a building — there's no signal. In a dense forest, in a gorge, between tall buildings — there is a signal, but it bounces off surfaces, and the receiver gets an "echo" that distorts the distance.
3. **Jamming.** Since the signal is weak, it's easy to jam: all you need is a transmitter that makes noise on the same frequency. Such transmitters can be very small.
4. **Spoofing.** This is even trickier: instead of jamming the signal, someone transmits a fake one. The receiver thinks it's in one place when it's actually somewhere else. You may have heard that in some areas car navigators sometimes show the car at an airport hundreds of kilometres away. That's exactly this kind of effect.

So you can't rely on GPS. A robot has to be able to find its way by itself. How?

## [25:00] Dead reckoning: how sailors did it

**Speaker:** Let's remember how sailors crossed the ocean before satellites. They used a method called **dead reckoning**. You know your starting point — the port. You know your heading — from the compass. You know your speed — from a special instrument, the log. You know the time. So you can work out where the ship is now.

Robots do the same thing. They have their own "log" and "compass".

### Wheel odometry

[Slide: a wheel with an encoder]

The simplest method is to count wheel revolutions. A sensor called an encoder sits on the wheel and counts how many degrees it has turned. If you know the wheel radius, you know the distance travelled. If the left and right wheels turn at different speeds, the robot is turning, and we can calculate the angle.

Simple? Yes. Does it work? Indoors on a flat floor — pretty well. Now let's go back to our field.

**Slipping.** In mud the wheel spins but the robot stays put. The encoder counts: "We've travelled ten metres." Reality: zero.

**Soft ground.** The wheel sinks, and its effective radius changes.

**Bumps.** On uneven ground the robot covers more distance than in a straight line.

Errors accumulate. Every small error in estimating the turning angle turns into a huge position error a hundred metres later. If you're off by one degree in direction, after a hundred metres you'll be almost two metres to the side. After a kilometre — seventeen metres.

### Inertial navigation

[Slide: an inertial measurement unit]

The second method is inertial navigation. The robot has a unit called an IMU — an inertial measurement unit. It contains accelerometers, which measure acceleration, and gyroscopes, which measure rotation rate. Every smartphone has similar, simpler ones: that's how the screen rotates when you turn your phone.

The idea: if we know the acceleration, we can integrate it to get velocity. Integrate velocity — and we get position. The gyroscope tells us which way we've turned.

The big plus: this method needs nothing from outside. No satellites, no landmarks. It doesn't care about dust, mud or jamming. That's why inertial navigation is used on submarines, aircraft and rockets.

The big minus: **drift**. Let's see why.

**Question for the audience:** Suppose an accelerometer has a very small error — one thousandth of the acceleration due to gravity, that is about 0.01 metres per second squared. How large will the position error be after one minute?

*(Pause. Someone in the audience starts calculating.)*

**Voice from the audience:** at²/2... 0.01 times 3,600, divided by two... Eighteen metres?

**Speaker:** Yes! Eighteen metres in a minute. And in ten minutes? Time squared — so a hundred times more: about 1.8 kilometres. The error grows *quadratically* with time because we integrate twice. And I picked a fairly good sensor. The cheap sensors in smartphones are less accurate.

Submarines carry very expensive inertial systems — they can run for a long time, but even they need periodic correction. For a robot in a field, such systems are too expensive.

There's another nuisance — vibration. A tractor shakes, the engine vibrates, and the accelerometer "sees" these vibrations as accelerations. They have to be filtered out.

### The compass

A magnetic compass helps you know your direction. But! Robots and farm machinery are made of metal, and they contain motors and current-carrying wires. All of that distorts the magnetic field. In a mine there may be ore all around. So the compass helps, but it's unreliable.

**Summing up dead reckoning:** all these methods are accurate over short periods, but errors accumulate. The longer you drive, the further you "drift". You need a way to periodically "anchor" yourself to reality.

## [42:00] Looking at the world: external sensors

**Speaker:** How did you find the door with your eyes closed? From memory. And if you open your eyes, you'll see the door and immediately correct your error. A robot also needs "eyes". What kinds are there?

[Slide: table of sensors — camera, lidar, radar, ultrasound]

### Cameras

Cheap, lots of information, they see colours and textures. There's a method called **visual odometry**: the robot compares two consecutive frames, finds the same points in both — say, the corner of a rock — and from how they've shifted works out how it has moved itself. This works on Mars too, by the way: American rovers used visual odometry to tell whether they were spinning their wheels in sand.

The downsides: cameras see poorly in the dark, in dust, in fog, in rain. The lens gets dirty. The sun dazzles them. And in a uniform field where everything is the same colour, the camera has nothing to "latch onto".

### Lidars

A lidar is a laser rangefinder that rotates or scans its surroundings and takes thousands or millions of measurements per second. The result is a point cloud, a 3D model of everything around it, accurate to centimetres. Lidars are used on self-driving cars.

Pros: accurate, independent of lighting, works at night.

Cons: expensive, though getting cheaper. And — crucially for us — dust, rain, snow, fog. The laser beam bounces off dust particles, and the lidar sees a "wall" where there isn't one. Imagine a tractor behind a combine harvester: the lidar will report a solid obstacle ahead.

### Radars

Radar uses radio waves, which have longer wavelengths than light. They pass through dust, smoke, fog, rain and snow almost without interference. That's why radar is so popular in harsh environments. The downside is that radar has lower resolution, so the picture is coarser. But it won't go blind.

### Ultrasound

Like bats, or the parking sensors in cars. Cheap, good for nearby obstacles, but only at short range.

**Question from the audience:** So which one is best?

**Speaker:** None of them. Here's the main idea of today's lecture: **there's no single perfect sensor**. Each has its weaknesses. The solution is to use several sensors together, so that the weaknesses of one are compensated by the strengths of another. This is called **sensor fusion**.

## [55:00] The Kalman filter, or trust but verify

[Slide: "Prediction → measurement → correction"]

**Speaker:** How do you combine data from different sensors when they contradict each other? Odometry says: "We're at point A." The camera says: "We're at point B." GPS, if it's there at all: "We're at point C." Whom do you trust?

The classic answer is the **Kalman filter**. It was invented in 1960 by Rudolf Kálmán, and almost immediately it was used for navigation on the Apollo spacecraft flying to the Moon. Today it's in practically every navigation device.

I'll explain the idea without formulas. Imagine you're walking through a dark room you've been in once before.

**Step 1. Prediction.** You take a step forward and think: "I was by the door, I took a step — so I'm half a metre from the door." But you're not sure: the step might have been shorter or longer. Your uncertainty grows with every step.

**Step 2. Measurement.** You reach out and feel a table. You remember where the table is. This measurement tells you: "You're next to the table." But it's also imprecise: you might have touched a corner or the middle.

**Step 3. Correction.** You combine the two estimates. But how? Not just by averaging. The Kalman filter says: *weight them by reliability*. If you've taken many steps and are already very unsure, but you felt the table clearly — trust the table more. If you've just left the door and are confident, but felt the table vaguely — trust your steps more.

The key idea of the filter is that it stores not only the position estimate but also the *uncertainty* of that estimate. That uncertainty grows while the robot drives "blind" and shrinks when a good measurement arrives.

For a robot this means: the inertial unit provides predictions very often — hundreds of times a second. The camera, lidar or radar — less often, but they "anchor" the robot to the world. GPS — great when it's there; when it's lost, the robot keeps going on its other sensors, and its uncertainty slowly grows.

**Question from the audience:** What if the GPS starts lying — say it's being spoofed?

**Speaker:** That's exactly where the filter helps. If GPS suddenly says we've moved two hundred metres in a second, but the inertial unit and odometry show we've been driving calmly at five kilometres an hour, that's physically impossible. A good system will notice the contradiction and stop trusting the GPS. This is called *integrity monitoring*. In essence, the sensors check each other.

## [68:00] SLAM: building a map while finding your way in it

**Speaker:** Now the most interesting problem. A robot has arrived somewhere it has never been. There's no map. There's no GPS. How does it find its way?

There's a chicken-and-egg problem here. To know where you are, you need a map: "I'm two metres from that rock." To build a map, you need to know where you are: "The rock is two metres from me, and I'm here, so the rock is here."

The solution is to do both at the same time. This is called **SLAM** — Simultaneous Localisation and Mapping.

[Slide: animation — a robot drives down a corridor, builds a map, comes back]

Roughly, it works like this:

1. The robot looks around and finds noticeable objects — *landmarks*: the corner of a building, a post, a big rock, a tree.
2. It remembers their positions relative to itself.
3. The robot drives a little. It sees the same landmarks again, but from a different angle. From how they've shifted, it understands how far it has moved. And it refines the positions of the landmarks.
4. New landmarks appear — they're added to the map.

Errors still accumulate. But there's a magic moment — **loop closure**. The robot drives a big circle and returns to a place it has been before. It recognises: "I saw this rock at the very beginning!" And now it can correct all the error accumulated along the entire route. The map "snaps together" and becomes correct.

**Question from the audience:** But how does it know it's the same rock?

**Speaker:** That's one of the hardest parts. In a city it's easy — the buildings are different. But in a field? All the bushes look the same. In a mine, all the walls look alike. The robot might make a mistake and "recognise" the wrong place — and then the map gets warped. That's why good systems are very careful about such decisions and check them in several ways. Neural networks are now widely used for this, because they're very good at recognising "I've seen this before", even if the lighting or the season has changed.

## [78:00] Tricks for fields and other real places

**Speaker:** Now a bit of practice — what techniques work in real harsh environments.

**Use whatever structure there is.** A field looks unstructured, but if you look closely, crops grow in rows. Rows of maize or sunflowers run in straight lines. A camera or lidar can recognise the rows and drive along them. A robot in a greenhouse can navigate by heating pipes or support posts. In a mine — by the walls of the tunnel.

**Put down your own landmarks.** If there are no landmarks, you can add them. For example, radio beacons, special markers that look like QR codes, reflectors for lidars. There's ultra-wideband radio technology — UWB — that lets you measure the distance to beacons with an accuracy of tens of centimetres. It's in some phones and in tags for finding keys, by the way.

**Protect your sensors.** It sounds simple, but it's half the battle. Blow air over the cameras, put "wipers" on the lidars, heat the sensors in winter, mount them higher so they collect less dust. In real projects, engineers spend a huge amount of time on this.

**Think about the map, not just the sensors.** If you have a pre-made map of the area — for example, from a drone — the robot can compare what it sees with that map. The terrain itself can also be a map: some aircraft navigation systems work this way, comparing the height of the ground below them with a terrain map.

**Remember safety.** If the robot isn't sure where it is, it's better to stop. A good system knows when it doesn't know. That's a general principle that works for people too, by the way.

## [86:00] Conclusion

[Slide: "Three main ideas"]

**Speaker:** Let's sum up. If you remember three things from this lecture, I'll be happy.

**First.** Navigation is a constant battle with errors. Every sensor lies; the only question is how and by how much.

**Second.** No sensor is perfect. Reliability comes from combining different sensors that check and complement each other.

**Third.** It matters to know not only "where am I" but also "how sure am I".

And one more thought, not about robots but about you. When I studied here, I thought physics, maths and programming were separate subjects. But look: to get a robot to drive across a field, you need physics — how sensors and satellites work; maths — how to combine data and integrate accelerations; programming — how to implement it all; and an understanding of the specific domain — what a field smells like in spring and why everything there is covered in mud. The most interesting problems are at the intersections.

Thank you! Ask your questions.

*(Applause.)*

---

## [88:00] Questions and answers

**Question:** How do Mars rovers navigate? There's no GPS there at all.

**Speaker:** Right, on Mars there's no GPS and no magnetic field you could use as a compass. Rovers use inertial navigation, wheel odometry and visual odometry — the very methods I talked about. To determine direction, they can look at the Sun: if you know the time and the Sun's position, you can work out where north is. And their global position is refined using images from orbit: they compare what they see around them with an orbital map.

**Question:** How much does a field robot cost?

**Speaker:** It depends a lot on what it does. Simple auto-steering systems for ordinary tractors already cost about as much as a used car. Fully autonomous robots are much more expensive. The main question in business isn't "how much does the robot cost" but "how much will it save". If a robot lets you apply fertiliser more precisely, avoid overlapping passes and work at night, it can pay for itself quite quickly. That's what I think about a lot at work.

**Question:** Will neural networks replace all these filters?

**Speaker:** Partly. Neural networks are excellent at recognising objects: where the plant is, where the weed is, where a person is, where a rock is. They're good at recognising places. But classical methods like the Kalman filter are good because they're *predictable*: we understand why they work the way they do, and we can prove that they estimate uncertainty correctly. That's very important for safety. Most often today a hybrid is used: neural networks for "perception", classical methods for "state estimation".

**Question:** How can you get into robotics at school?

**Speaker:** Build a robot. Any robot. Take an Arduino or Raspberry Pi board, two motors, wheels and an ultrasonic sensor. Try to make it follow a line or avoid obstacles. Then add an IMU and try to calculate where the robot is. You'll very quickly see in practice how errors accumulate. Then try to correct them. That's the best textbook there is. And take part in robotics competitions — that's where you learn fastest, because everything breaks at the worst possible moment.

**Question:** Is it hard to study at MIPT?

**Speaker:** *(laughs)* It's hard. But interesting. After Letovo it's not as scary as it seems.

Thank you all!

---

*Material on the lecture topic, prepared from the announcement on the Science Lounge website. It is not a transcript of the talk.*
