declare module "lucide-react/dist/esm/icons/*" {
  import * as React from "react";

  const Icon: React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>
  >;
  export default Icon;
}
