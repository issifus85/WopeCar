import { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

const SECTIONS = [
  {
    heading: 'Introduction',
    body: `The business of ACRE Logistics, WopeCar includes but is not limited to the offering of services related to the sharing of vehicles and the creation, operation and management of the WOPECAR application/website; a flagship franchise of the Company.

The services of WOPECAR include online car rental, member subscriptions to rent out cars online, tracking and cancellation of online booking, marketing or promotion of online services and other associated services. We provide an online car sharing platform that connects vehicle owners with travelers and locals seeking to rent cars.

By accessing or agreeing to use the services, you agree to comply with, and be legally bound by, the provisions of these Terms of Service (these "Terms"), whether or not you become a registered user of the Services. These terms govern your access to and use of the services and constitute a binding legal agreement between you and Wopecar.

These terms, together with Wopecar's Privacy Policy, applicable insurance terms and certificates, roadside assistance terms, and the user policies accessible via the Services (the "Policies") constitute the entire "Agreement" between you and Wopecar (each a "Party" and together, "the Parties").`,
  },
  {
    heading: 'Modification',
    body: `Wopecar reserves the right, at our sole discretion, to modify the Services or to modify the Agreement, including these Terms, at any time. If we modify these Terms, we will post the modification on the Services and update the "Last Revised" date at the top of these Terms.

If you continue to access or use the Services after we have posted a modification or provided you with notice of a modification, you are indicating that you agree to be bound by the modified terms. If the modified terms are not acceptable to you, your sole recourse is to stop using and accessing the Services and close your Account.`,
  },
  {
    heading: 'Eligibility, Registration, Verification & Definitions',
    body: `Eligibility

This Service is intended solely for licensed drivers who are at least 22 years old. The Service is not available to any Users previously removed from the Service due to violation of any of our terms, unless a written notice of reinstatement has been given. All Users must pass our Eligibility Requirements and must provide all necessary and complete documentation for determining eligibility throughout your use of the Service.

Definitions

"Partner" means any User that establishes a Partner Account and submits a vehicle that meets all eligibility requirements to be shared through the Service. "Rider" means any User that establishes a Rider Account, allowing them to reserve a vehicle via the Service. Users with a Rider or Partner Account are collectively "Members." Each transaction in which a Rider reserves a vehicle from a Partner is a "Reservation".

By applying for a Rider or Partner Account, you give us permission to disclose the information you provide to third parties for verification purposes. Unless you are creating a Business Account: your Member Account is for personal use only, you may not permit anyone else to use it, and you must keep your Account information accurate and your password secure. You must notify Wopecar immediately of any breach of security or unauthorized use of your Account.

By providing your email address and phone number, you consent to our use of them to send you Service-related email, SMS messages, and notices required by law. We may also send other messages such as feature updates or offers, which you may opt out of via your Settings page.

Registration

To access certain features you must sign up for an account by providing your first and last name, email address, and creating a password (or connecting through a third-party account). When you book or list a vehicle, you must provide accurate, current, and complete information and keep your Account up to date. Based on information you provide, we may impose additional requirements to book a trip (e.g. a deposit, a second payment method, or a certain protection plan).

Verification

Where permitted, WopeCar has the right and obligation to undertake screenings and checks designed to (1) help verify the identities or check the backgrounds of users and driver's licence validity, and (2) verify vehicle details. We may use third-party services to verify the information you provide, and you authorize us to request, receive, use, and store such information. Wopecar may permit or refuse your request to book or list a vehicle in its sole discretion.`,
  },
  {
    heading: 'Payments',
    body: `All payments for Wopecar's Services shall be made on a daily rate basis and paid at the end of the month. The rates are all-inclusive and not subject to fluctuation or revision during the term of rental.

All electronic payments to Wopecar shall be made through the Paystack Payment System or other agreed media, in advance. Registration of Partners and Vehicles with Wopecar is complete once details are recorded in the car listing inventory. Payment for registration with and Services of WOPECAR does not constitute payment to the Drivers and Vehicles Licensing Authority (DVLA) of Ghana.

Any default in payment is calculated as rent on the Vehicle on a daily basis, plus 10% per hour if the default exceeds two or more hours — for example, where a Client fails to return the Vehicle within the paid or rental time.`,
  },
  {
    heading: 'Your Commitments',
    body: `You agree that you will always use your Wopecar Account and the Services in compliance with these Terms, applicable law, and any other policies and standards provided to you.

You are, and will be, solely responsible for all activity that occurs through your Wopecar Account. Keep your Account information, including your password, secure, and do not disclose it to any third party. You will immediately notify Wopecar of any actual or suspected unauthorized use of your Account. We are not responsible for your failure to comply with this clause, or for any delay in shutting down or protecting your Account, unless you have reported unauthorized access to us.`,
  },
  {
    heading: 'Content',
    body: `We may, in our sole discretion, permit you to post, upload, publish, submit or transmit content through the Services, such as photographs, reviews, feedback, and descriptions of you, your vehicle, or your trip.

By making any content available on or through the Services, you grant us an irrevocable, perpetual (or for the term of the protection), non-exclusive, transferable right to use, view, copy, adapt, modify, distribute, transfer, publicly display, publicly perform, transmit, stream, broadcast, access, and otherwise exploit such content to operate, promote, or market the Services. Except as described with respect to photography provided to Partners, we do not claim ownership of any such content.`,
  },
  {
    heading: 'Prohibited Activities',
    body: `In connection with your use of or access to the Services, you agree that you will not, nor advocate, encourage, request, or assist any third party to:

• Violate any law or regulation, or any order of a court, including licensing/registration requirements or third-party rights; post false, inaccurate, misleading, defamatory, or libelous content; or infringe, reproduce, or prepare derivative works from content belonging to Wopecar or another user without permission.
• Dilute, tarnish, or otherwise harm the Wopecar brand — including through unauthorized use of the Services, or registering domain names, trade names, trademarks, or social media accounts that imitate or are confusingly similar to Wopecar's.
• Provide false or misleading information, including a false name, date of birth, driver's licence details, payment method, or insurance information, or register an Account on behalf of someone else.
• Use the Services for unrelated purposes — contacting another user outside of a booking, commercializing content found on the Services, harvesting user information without consent, or recruiting users to competing services.
• Interfere with the operation of the Services — interfering with another user's listings, transacting with family/household/friends/colleagues, sending unsolicited commercial messages, or distributing viruses, harmful code, or denial-of-service attacks.

Violations. If we believe you are abusing the platform, our users, or any other person, or violating the letter or spirit of these Terms, we may limit, suspend, or terminate your Account and access to the Services, remove content or listings, reduce or eliminate discounts, and take technical or legal steps to prevent further use, at our sole discretion.

Communication with you. You agree that we may contact you using pre-recorded messages, calls, or text messages to confirm signup, provide Account notices, investigate or prevent fraud, or communicate urgent messages. We will not share your phone number with third parties for their own purposes without your consent.

Insurance and protection plans. We are not an insurance company and do not insure Partners or Riders. Protection plans made available through the Services are available to members at Wopecar's sole discretion, and eligibility for coverage requires compliance with these Terms.`,
  },
  {
    heading: 'Specific Terms for Riders',
    body: `As a Rider, you commit that you are a legally licensed driver and will provide proof of a current, valid driver's licence; that you will treat the vehicle and any Extras well and return them on time and in essentially the same condition as received; and that you will not allow anyone other than an Approved Driver to drive the booked vehicle.

Financial responsibility. The Rider that booked the trip ("primary Rider") is financially responsible for all physical damage to or theft of a booked vehicle that occurs during a trip, plus any additional costs resulting from damage of any kind, regardless of fault — whether or not you have your own auto insurance. You agree to work with Wopecar to make a claim for coverage under any applicable insurance policy. Choosing a protection plan on the Services can limit the amount you're obligated to pay out of pocket, provided you and any Approved Driver abide by these Terms, and only for damage that is not mechanical or interior damage.

Auto liability insurance. Most Partners cannot offer you liability insurance directly. All protection plans offered on the Services include coverage under a third-party automobile liability insurance policy; if you have your own personal auto policy, it is typically primary over the protection policy, depending on the insurer's terms.

Use of the vehicle. You must use a booked vehicle only for personal use, not for any commercial purpose (e.g. driving passengers for a fee via Uber/Bolt, or delivering food or packages). You may only access the vehicle during the trip window, must return it on time to the agreed location, must present a current valid driver's licence, and must operate the vehicle safely and in compliance with all applicable laws.

Vehicle theft. The following may result in the vehicle being reported stolen to law enforcement, and can void your protection plan: failing to return the vehicle at the agreed time/place; not obtaining a proper reservation extension; returning the vehicle to the wrong location; misrepresenting facts about the booking or use; theft or damage occurring while the vehicle was left unlocked, running, or unattended with keys not secured; failing to cooperate with police or Wopecar in an investigation; or the vehicle being operated by someone using a fictitious name, false address, or invalid driver's licence.`,
  },
  {
    heading: 'Specific Terms for Partners',
    body: `As a Partner, you agree to take all necessary measures to ensure the safety and cleanliness of your vehicle; observe regulations including carrying a safety vest and warning triangle; ensure special equipment (e.g. baby seats) complies with safety standards; keep the vehicle in perfect working order and carry out manufacturer-recommended maintenance; audit the vehicle when a Client reports a problem; verify there's no incompatibility between your own insurance and use of the WOPECAR service; provide a compliant, accurate vehicle description including photos; keep your Vehicle Inventory up to date; and respond to rental requests within 24 hours.

You commit to providing a safe, legally registered and insured vehicle with current licence plates, a clean (non-salvage) title, and in good mechanical condition; that your listings will be complete and accurate; that you own or have authority to share the vehicle; and that you will not offer a vehicle that is unsafe, stolen, subject to an unaddressed safety recall, or not roadworthy.

Photography. We may offer photographers to take photos of your vehicle and/or you with it ("Images"). Wopecar may use the Images for advertising, marketing, and other business purposes across any media, without further notice or compensation.

Pricing, earnings, and payments. You may set and revise your vehicle's pricing. Wopecar will pay you the amount collected from Riders, less the applicable fees payable to Wopecar, according to your chosen payment plan.

Reporting vehicle damage. If you believe a rider caused damage to your vehicle, you must report it as soon as you become aware (no more than 24 hours after the scheduled trip end) and cooperate with the investigation to be eligible for coverage under your protection plan. All Partner protection plans include coverage under a third-party automobile liability insurance policy.

Missing vehicles. If your vehicle goes missing, is not returned, or is stolen during a reservation, you must immediately contact a Wopecar representative and follow their instructions, including filing a police report within 24 hours if instructed. If you selected a protection plan, its insurers will defend and indemnify you against qualifying claims, subject to your compliance with these Terms and any policy exclusions.`,
  },
  {
    heading: 'Dispute Resolution',
    body: `Liability and indemnification. Partners and Riders shall defend and indemnify Wopecar against claims, demands, losses, costs, liabilities and expenses arising out of damage to a vehicle, injury to or death of any person, or damage to property in connection with the Services, regardless of fault — except where the loss results solely from Wopecar's own negligence or wilful misconduct. Neither party is liable to the other for consequential damages, including loss of profit or business opportunity.

Limitation of liability of WOPECAR. Wopecar's liability is limited to the Services it provides: an online platform enabling the rental of vehicles between private individuals. Wopecar does not guarantee that information given by members at registration is error-free; is under no obligation to supervise a vehicle or its Members; and is not liable for theft or damage to a vehicle during a lease, for errors or unavailability of the Site, or for any direct or indirect damage arising from use of the Site. Riders and Partners remain responsible for driving only on lanes intended for vehicular traffic, not modifying the vehicle, using required safety equipment, reporting defects and incidents promptly, not subletting the vehicle, not using it for illicit purposes or while impaired, parking legally, covering fuel and any traffic violations incurred, and returning the vehicle on the agreed date and time.

Confidentiality. Technical information shared between Partners, Riders, and Wopecar (via BIS Digimedia) will be used only for performance of the Service and will not be disclosed to third parties without written consent, except information that is already public or independently obtained.

Applicable law and dispute resolution. This Agreement is governed by the laws of the Republic of Ghana. The Parties agree to submit to the exclusive jurisdiction of the courts of Ghana for any dispute that cannot be settled amicably through direct discussion.

Termination. Wopecar (via BIS Digimedia) may terminate this Agreement at any time and for any reason, with five days' notice. Outstanding debts owed by either Party remain payable upon termination.

Force majeure. Neither Party is liable for delay or failure to perform obligations caused by a Force Majeure Event, provided prompt notice is given and reasonable efforts are made to mitigate its effects. Wopecar has no obligation to make payments for work a Party is unable to perform because of such an event.

Severability & entire agreement. If any provision of this Agreement is held invalid or unenforceable, the remaining provisions remain in full force and effect. This Agreement states the entire understanding between you and WOPECAR and supersedes any earlier verbal or written communications; rights and obligations may not be assigned or transferred without prior written consent.`,
  },
  {
    heading: 'General Provisions',
    body: `You may discontinue your use of the Services at any time, and we may terminate your access or remove listings for any reason to the extent permissible by law. Termination does not release either Party from obligations incurred prior to termination, and disclaimers, liability limitations, and dispute provisions survive termination.

Nothing in these Terms constitutes an actual or purported transfer or assignment of any right or interest in a vehicle shared through the Services.

Failure by Wopecar to enforce any right or obligation in this Agreement is not a waiver of that right. English is the official language of this Agreement; all correspondence, notices, and documentation shall be in English. Notices under this Agreement shall be in writing and delivered by mail, in person, or by fax to the address indicated by the relevant Party.

We are not a rental car company. We do not own a fleet of vehicles and are not in the business of renting vehicles to the public — we provide an online platform where vehicle owners and those in need of a vehicle can meet and share vehicles, subject to these Terms.

The substantive laws of the Republic of Ghana apply to these Terms without regard to conflict of law provisions. If any provision is held void or unenforceable, the remaining provisions remain in full force and effect, and failure to enforce any provision is not a waiver of it or any other provision.`,
  },
];

function AccordionSection({ heading, body }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Text style={styles.heading}>{heading}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.teal} />
      </TouchableOpacity>
      {expanded && <Text style={styles.body}>{body}</Text>}
    </View>
  );
}

export default function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.intro}>
        The following are WopeCar's Terms of Service, as published on wopecar.com. By using the app, you agree to these terms. Tap a heading to expand it.
      </Text>

      {SECTIONS.map((section) => (
        <AccordionSection key={section.heading} heading={section.heading} body={section.body} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.navy,
    marginBottom: 8,
  },
  intro: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
    lineHeight: 19,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
  },
  heading: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    paddingBottom: 16,
  },
});
