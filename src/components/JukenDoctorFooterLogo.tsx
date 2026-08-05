import { isSecondarySchoolGrade } from "@/lib/constants";
import jukenDoctorLogo from "../../public/juken-doctor-logo.png";
import jukenDoctorSecondaryLogo from "../../public/juken-doctor-logo-secondary.png";

type Props = {
  grade: string;
  className: string;
  alt?: string;
};

/** 合格プログラム・直前期・講習提案書の右下ロゴ（中学・高校は別デザイン） */
export function JukenDoctorFooterLogo({
  grade,
  className,
  alt = "受験ドクター",
}: Props) {
  const logo = isSecondarySchoolGrade(grade)
    ? jukenDoctorSecondaryLogo
    : jukenDoctorLogo;

  return (
    <img
      src={logo.src}
      alt={alt}
      width={logo.width}
      height={logo.height}
      className={className}
      decoding="sync"
      loading="eager"
    />
  );
}
